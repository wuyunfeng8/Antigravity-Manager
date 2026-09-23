use crate::{
    models::{quota::normalize_subscription_tier, Account, QuotaData},
    modules,
};
use std::sync::atomic::{AtomicU8, Ordering};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Listener, Manager,
};

const IDLE: u8 = 0;
const SWITCHING: u8 = 1;
const REFRESHING: u8 = 2;
static TRAY_BUSY: AtomicU8 = AtomicU8::new(IDLE);
static TRAY_ERROR: AtomicU8 = AtomicU8::new(IDLE);

fn is_relay_candidate(account: &Account, current_id: Option<&str>) -> bool {
    Some(account.id.as_str()) != current_id
        && !account.disabled
        && !account.validation_blocked
        && !account
            .quota
            .as_ref()
            .is_some_and(|quota| quota.is_forbidden)
}

fn model_percentage(quota: &QuotaData, category: &str) -> Option<i32> {
    let preferred: &[&str] = match category {
        "gemini" => &[
            "gemini-pro-agent",
            "gemini-3.1-pro-high",
            "gemini-3.1-pro",
            "gemini-2.5-pro",
            "gemini-3-flash-agent",
            "gemini-3.7-flash",
            "gemini-3.5-flash",
            "gemini-3-flash",
        ],
        "claude" => &[
            "claude-opus-4-6-thinking",
            "claude-sonnet-4-6",
            "claude-opus-4-6",
        ],
        "gpt" => &[
            "gpt-oss-120b-medium",
            "gpt-oss-120b",
            "gpt-oss-20b",
            "gpt-4o",
            "gpt-4",
            "gpt-5",
        ],
        _ => &[],
    };
    let matches = |name: &str| match category {
        "gemini" => name.contains("gemini") && !name.contains("image"),
        "claude" => ["claude", "opus", "sonnet", "haiku"]
            .iter()
            .any(|part| name.contains(part)),
        "gpt" => ["gpt", "openai", "o1", "o3", "codex"]
            .iter()
            .any(|part| name.contains(part)),
        _ => false,
    };
    preferred
        .iter()
        .find_map(|id| {
            quota
                .models
                .iter()
                .find(|model| model.name.eq_ignore_ascii_case(id))
        })
        .or_else(|| {
            quota
                .models
                .iter()
                .find(|model| matches(&model.name.to_lowercase()))
        })
        .map(|model| model.percentage)
        .or_else(|| {
            (category == "gpt")
                .then(|| model_percentage(quota, "claude"))
                .flatten()
        })
}

fn display_percentage(quota: &QuotaData, category: &str) -> Option<i32> {
    let third_party = category != "gemini";
    let buckets: Vec<_> = quota
        .quota_groups
        .as_ref()
        .into_iter()
        .flatten()
        .filter(|group| {
            let name = group.display_name.to_lowercase();
            let is_3p = ["claude", "gpt", "3p"]
                .iter()
                .any(|part| name.contains(part))
                || group.buckets.iter().any(|bucket| {
                    ["claude", "gpt", "3p"]
                        .iter()
                        .any(|part| bucket.bucket_id.to_lowercase().contains(part))
                });
            is_3p == third_party
        })
        .flat_map(|group| &group.buckets)
        .collect();
    let five_hour = buckets
        .iter()
        .filter(|bucket| {
            let window = format!("{} {}", bucket.window, bucket.bucket_id).to_lowercase();
            window.contains("5h") || window.contains("hour")
        })
        .map(|bucket| (bucket.remaining_fraction * 100.0).round() as i32)
        .min();
    let weekly_exhausted = buckets.iter().any(|bucket| {
        let window = format!("{} {}", bucket.window, bucket.bucket_id).to_lowercase();
        (window.contains("week") || window.contains("7d"))
            && bucket.remaining_fraction <= 0.001
            && chrono::DateTime::parse_from_rfc3339(&bucket.reset_time)
                .is_ok_and(|reset| reset.timestamp() > chrono::Utc::now().timestamp())
    });
    if weekly_exhausted {
        Some(0)
    } else {
        five_hour.or_else(|| model_percentage(quota, category))
    }
}

fn relay_score(account: &Account) -> i32 {
    let tier = account
        .quota
        .as_ref()
        .and_then(|q| q.subscription_tier.as_deref())
        .map(normalize_subscription_tier);
    let weight = match tier.as_deref() {
        Some("ULTRA") => 300,
        Some("PRO") => 200,
        _ => 100,
    };
    let claude = account
        .quota
        .as_ref()
        .and_then(|q| model_percentage(q, "claude"))
        .unwrap_or(0);
    let gemini = account
        .quota
        .as_ref()
        .and_then(|q| model_percentage(q, "gemini"))
        .unwrap_or(0);
    weight + claude + gemini
}

fn recommended_account<'a>(
    accounts: &'a [Account],
    current_id: Option<&str>,
) -> Option<&'a Account> {
    let current_id = current_id?;
    accounts
        .iter()
        .filter(|account| is_relay_candidate(account, Some(current_id)))
        .max_by_key(|account| relay_score(account))
}

fn account_label(account: &Account) -> &str {
    account
        .custom_label
        .as_deref()
        .filter(|label| !label.trim().is_empty())
        .or_else(|| {
            account
                .name
                .as_deref()
                .filter(|name| !name.trim().is_empty())
        })
        .unwrap_or(&account.email)
}

pub fn create_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let config = modules::load_app_config().unwrap_or_default();
    let texts = modules::i18n::get_tray_texts(&config.language);

    // macOS uses a template image; Windows and Linux use the full-color icon.
    #[cfg(target_os = "macos")]
    let icon_bytes: &[u8] = include_bytes!("../../icons/tray-icon.png");
    #[cfg(not(target_os = "macos"))]
    let icon_bytes: &[u8] = include_bytes!("../../icons/icon.png");

    let img = image::load_from_memory(icon_bytes)
        .map_err(|e| tauri::Error::Io(std::io::Error::other(e.to_string())))?
        .to_rgba8();
    let (width, height) = img.dimensions();
    let icon = Image::new_owned(img.into_raw(), width, height);

    let info_user = MenuItem::with_id(
        app,
        "current",
        format!("{} · ...", texts.current),
        false,
        None::<&str>,
    )?;
    let show_i = MenuItem::with_id(app, "show", &texts.show_window, true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", &texts.quit, true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&info_user, &sep1, &show_i, &quit_i])?;

    let _ = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .on_menu_event(move |app, event| {
            let app_handle = app.clone();
            let event_id = event.id().as_ref().to_string();
            match event_id.as_str() {
                "show" => show_main_window(app),
                "quit" => {
                    tracing::info!("[Tray] Exiting application...");
                    std::process::exit(0);
                }
                "refresh_curr" => {
                    if TRAY_BUSY
                        .compare_exchange(IDLE, REFRESHING, Ordering::SeqCst, Ordering::SeqCst)
                        .is_err()
                    {
                        return;
                    }
                    TRAY_ERROR.store(IDLE, Ordering::SeqCst);
                    update_tray_menus(&app_handle);
                    tauri::async_runtime::spawn(async move {
                        let mut succeeded = false;
                        if let Ok(Some(account_id)) = modules::get_current_account_id() {
                            if let Ok(mut account) = modules::load_account(&account_id) {
                                match modules::account::fetch_quota_with_retry(&mut account).await {
                                    Ok(quota) => {
                                        succeeded =
                                            modules::update_account_quota(&account.id, quota)
                                                .is_ok();
                                        if succeeded {
                                            let _ = app_handle.emit("tray://refresh-current", ());
                                        }
                                    }
                                    Err(e) => {
                                        modules::logger::log_error(&format!(
                                            "Tray refresh failed: {}",
                                            e
                                        ));
                                    }
                                }
                            }
                        }
                        TRAY_ERROR
                            .store(if succeeded { IDLE } else { REFRESHING }, Ordering::SeqCst);
                        TRAY_BUSY.store(IDLE, Ordering::SeqCst);
                        update_tray_menus(&app_handle);
                    });
                }
                _ if event_id.starts_with("relay:") => {
                    if TRAY_BUSY
                        .compare_exchange(IDLE, SWITCHING, Ordering::SeqCst, Ordering::SeqCst)
                        .is_err()
                    {
                        return;
                    }
                    TRAY_ERROR.store(IDLE, Ordering::SeqCst);
                    let target_id = event_id.trim_start_matches("relay:").to_string();
                    update_tray_menus(&app_handle);
                    tauri::async_runtime::spawn(async move {
                        let mut succeeded = false;
                        let current_id = modules::get_current_account_id().unwrap_or(None);
                        if let Ok(account) = modules::load_account(&target_id) {
                            if is_relay_candidate(&account, current_id.as_deref()) {
                                let integration = crate::modules::integration::DesktopIntegration {
                                    app_handle: app_handle.clone(),
                                };
                                if modules::switch_account(&target_id, None, &integration)
                                    .await
                                    .is_ok()
                                {
                                    let _ = app_handle.emit("tray://account-switched", target_id);
                                    succeeded = true;
                                }
                            }
                        }
                        TRAY_ERROR
                            .store(if succeeded { IDLE } else { SWITCHING }, Ordering::SeqCst);
                        TRAY_BUSY.store(IDLE, Ordering::SeqCst);
                        update_tray_menus(&app_handle);
                    });
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    update_tray_menus(app);

    // Listen for config update events
    let handle = app.clone();
    app.listen("config://updated", move |_event| {
        modules::logger::log_info("Configuration updated, refreshing tray menu");
        update_tray_menus(&handle);
    });

    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        #[cfg(target_os = "macos")]
        app.set_activation_policy(tauri::ActivationPolicy::Regular)
            .unwrap_or(());
    }
}

/// Refresh the native menu from stored account state.
pub fn update_tray_menus(app: &tauri::AppHandle) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let config = modules::load_app_config().unwrap_or_default();
        let texts = modules::i18n::get_tray_texts(&config.language);
        let current_id = modules::get_current_account_id().unwrap_or(None);
        let current = current_id
            .as_deref()
            .and_then(|id| modules::load_account(id).ok());
        let accounts = modules::list_accounts().unwrap_or_default();
        let recommended = current
            .as_ref()
            .and_then(|_| recommended_account(&accounts, current_id.as_deref()));
        let busy = TRAY_BUSY.load(Ordering::SeqCst);

        let current_name = current
            .as_ref()
            .map(account_label)
            .unwrap_or(&texts.no_account);
        let needs_attention = current.as_ref().is_some_and(|account| {
            account.disabled
                || account.validation_blocked
                || account
                    .quota
                    .as_ref()
                    .is_some_and(|quota| quota.is_forbidden)
        });
        let current_label = if needs_attention {
            format!(
                "{} · {} · {}",
                texts.current, current_name, texts.account_attention
            )
        } else {
            format!("{} · {}", texts.current, current_name)
        };
        let current_item =
            MenuItem::with_id(&handle, "current", &current_label, false, None::<&str>);
        let quota_items: Vec<_> = ["gemini", "claude", "gpt"]
            .iter()
            .map(|category| {
                let value = current
                    .as_ref()
                    .filter(|account| !account.disabled && !account.validation_blocked)
                    .and_then(|account| account.quota.as_ref())
                    .filter(|quota| !quota.is_forbidden)
                    .and_then(|quota| display_percentage(quota, category))
                    .map(|number| format!("{number}%"))
                    .unwrap_or_else(|| "—".to_string());
                let label = match *category {
                    "gemini" => "Gemini",
                    "claude" => "Claude",
                    _ => "GPT",
                };
                MenuItem::with_id(
                    &handle,
                    format!("quota_{category}"),
                    format!("{label} · {value}"),
                    false,
                    None::<&str>,
                )
            })
            .collect();
        let relay_id = recommended
            .map(|account| format!("relay:{}", account.id))
            .unwrap_or_else(|| "relay:none".to_string());
        let relay_label = if busy == SWITCHING {
            texts.switching.clone()
        } else if let Some(account) = recommended {
            format!("{} · {}", texts.relay_to, account_label(account))
        } else {
            texts.no_relay.clone()
        };
        let relay = MenuItem::with_id(
            &handle,
            relay_id,
            &relay_label,
            recommended.is_some() && busy == IDLE,
            None::<&str>,
        );
        let refresh_label = if busy == REFRESHING {
            &texts.refreshing
        } else {
            &texts.refresh_current
        };
        let refresh = MenuItem::with_id(
            &handle,
            "refresh_curr",
            refresh_label,
            current.is_some() && busy == IDLE,
            None::<&str>,
        );
        let show = MenuItem::with_id(&handle, "show", &texts.show_window, true, None::<&str>);
        let quit = MenuItem::with_id(&handle, "quit", &texts.quit, true, None::<&str>);
        let error_text = match TRAY_ERROR.load(Ordering::SeqCst) {
            SWITCHING => Some(&texts.switch_failed),
            REFRESHING => Some(&texts.refresh_failed),
            _ => None,
        };
        let error_item = error_text.and_then(|text| {
            MenuItem::with_id(&handle, "operation_error", text, false, None::<&str>).ok()
        });
        if let (
            Ok(current_item),
            [Ok(gemini), Ok(claude), Ok(gpt)],
            Ok(relay),
            Ok(refresh),
            Ok(show),
            Ok(quit),
        ) = (
            current_item,
            quota_items.as_slice(),
            relay,
            refresh,
            show,
            quit,
        ) {
            let sep1 = PredefinedMenuItem::separator(&handle);
            let sep2 = PredefinedMenuItem::separator(&handle);
            let sep3 = PredefinedMenuItem::separator(&handle);
            if let (Ok(sep1), Ok(sep2), Ok(sep3)) = (sep1, sep2, sep3) {
                let mut items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
                    vec![&current_item, gemini, claude, gpt, &sep1, &relay, &refresh];
                if let Some(ref error_item) = error_item {
                    items.push(error_item);
                }
                items.extend([
                    &sep2 as &dyn tauri::menu::IsMenuItem<tauri::Wry>,
                    &show,
                    &sep3,
                    &quit,
                ]);
                if let Ok(menu) = Menu::with_items(&handle, &items) {
                    if let Some(tray) = handle.tray_by_id("main") {
                        let _ = tray.set_menu(Some(menu));
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{display_percentage, recommended_account};
    use crate::models::{quota::ModelQuota, Account, QuotaData, TokenData};

    fn account(id: &str, tier: &str, disabled: bool) -> Account {
        let token = TokenData::new(
            String::new(),
            String::new(),
            0,
            None,
            None,
            None,
            false,
            None,
        );
        let mut account = Account::new(id.to_string(), format!("{id}@example.test"), token);
        let mut quota = QuotaData::new();
        quota.subscription_tier = Some(tier.to_string());
        account.quota = Some(quota);
        account.disabled = disabled;
        account
    }

    #[test]
    fn relay_excludes_unavailable_accounts_and_needs_current_account() {
        let current = account("current", "FREE", false);
        let disabled = account("disabled", "ULTRA", true);
        let mut blocked = account("blocked", "ULTRA", false);
        blocked.validation_blocked = true;
        let mut forbidden = account("forbidden", "ULTRA", false);
        forbidden.quota.as_mut().unwrap().is_forbidden = true;
        let ready = account("ready", "PRO", false);
        let accounts = [current, disabled, blocked, forbidden, ready];
        assert!(recommended_account(&accounts, None).is_none());
        assert_eq!(
            recommended_account(&accounts, Some("current")).unwrap().id,
            "ready"
        );
    }

    #[test]
    fn missing_quota_is_distinct_from_zero_and_gpt_can_share_claude() {
        let mut quota = QuotaData::new();
        assert_eq!(display_percentage(&quota, "gemini"), None);
        quota.models.push(
            serde_json::from_value::<ModelQuota>(serde_json::json!({
                "name": "claude-sonnet-4-6", "percentage": 0, "reset_time": ""
            }))
            .unwrap(),
        );
        assert_eq!(display_percentage(&quota, "claude"), Some(0));
        assert_eq!(display_percentage(&quota, "gpt"), Some(0));
    }

    #[test]
    fn exhausted_weekly_bucket_overrides_five_hour_balance() {
        let mut quota = QuotaData::new();
        let reset = (chrono::Utc::now() + chrono::Duration::days(1)).to_rfc3339();
        quota.quota_groups = Some(serde_json::from_value(serde_json::json!([{
            "display_name": "Gemini Models",
            "buckets": [
                {"bucket_id": "gemini-5h", "window": "5h", "remaining_fraction": 0.63, "reset_time": reset},
                {"bucket_id": "gemini-weekly", "window": "weekly", "remaining_fraction": 0.0, "reset_time": reset}
            ]
        }])).unwrap());
        assert_eq!(display_percentage(&quota, "gemini"), Some(0));
    }
}
