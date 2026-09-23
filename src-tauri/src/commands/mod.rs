use crate::models::{Account, AccountView, AppConfig, QuotaData};
use crate::modules;
use std::path::PathBuf;
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

// 导出 autostart 命令
pub mod autostart;

/// 列出所有账号
#[tauri::command]
pub async fn list_accounts() -> Result<Vec<AccountView>, String> {
    tokio::task::spawn_blocking(modules::list_accounts)
        .await
        .unwrap_or_else(|_| Err("Task panicked".to_string()))
        .map(|accounts| accounts.into_iter().map(AccountView::from).collect())
}

/// 添加账号
#[tauri::command]
pub async fn add_account(
    app: tauri::AppHandle,
    _email: String,
    refresh_token: String,
) -> Result<AccountView, String> {
    let service = modules::account_service::AccountService::new(
        crate::modules::integration::SystemManager::Desktop(app.clone()),
    );

    let account = service.add_account(&refresh_token).await?;
    crate::modules::tray::update_tray_menus(&app);
    Ok(account.into())
}

/// 删除账号
#[tauri::command]
pub async fn delete_account(app: tauri::AppHandle, account_id: String) -> Result<(), String> {
    let service = modules::account_service::AccountService::new(
        crate::modules::integration::SystemManager::Desktop(app.clone()),
    );
    service.delete_account(&account_id)?;

    Ok(())
}

/// 切换账号
#[tauri::command]
pub async fn switch_account(app: tauri::AppHandle, account_id: String) -> Result<(), String> {
    let service = modules::account_service::AccountService::new(
        crate::modules::integration::SystemManager::Desktop(app.clone()),
    );

    service.switch_account(&account_id, Some("classic")).await?;

    // 同步托盘
    crate::modules::tray::update_tray_menus(&app);

    Ok(())
}

/// 获取当前账号
#[tauri::command]
pub async fn get_current_account() -> Result<Option<AccountView>, String> {
    modules::logger::log_info("Backend Command: get_current_account called");

    let account_id = modules::get_current_account_id()?;

    if let Some(id) = account_id {
        modules::load_account(&id).map(|account| Some(account.into()))
    } else {
        modules::logger::log_info("   No current account set");
        Ok(None)
    }
}

/// 内部辅助功能：在添加或导入账号后自动刷新一次额度
async fn internal_refresh_account_quota(
    app: &tauri::AppHandle,
    account: &mut Account,
) -> Result<QuotaData, String> {
    modules::logger::log_info(&format!("自动触发刷新配额: {}", account.email));

    // 使用带重试的查询 (Shared logic)
    match modules::account::fetch_quota_with_retry(account).await {
        Ok(quota) => {
            // 更新账号配额
            let _ = modules::update_account_quota(&account.id, quota.clone());
            // 更新托盘菜单
            crate::modules::tray::update_tray_menus(app);
            Ok(quota)
        }
        Err(e) => {
            modules::logger::log_warn(&format!("自动刷新配额失败 ({}): {}", account.email, e));
            Err(e.to_string())
        }
    }
}

/// 查询账号配额
#[tauri::command]
pub async fn fetch_account_quota(
    app: tauri::AppHandle,
    account_id: String,
) -> crate::error::AppResult<QuotaData> {
    modules::logger::log_info(&format!("手动刷新配额请求: {}", account_id));
    let mut account =
        modules::load_account(&account_id).map_err(crate::error::AppError::Account)?;

    // 使用带重试的查询 (Shared logic)
    let mut quota = modules::account::fetch_quota_with_retry(&mut account).await?;

    // 更新账号配额
    modules::update_account_quota(&account_id, quota.clone())
        .map_err(crate::error::AppError::Account)?;

    quota.ensure_subscription_tier();

    crate::modules::tray::update_tray_menus(&app);

    Ok(quota)
}

pub use modules::account::RefreshStats;

/// 刷新所有账号配额 (内部实现)
pub async fn refresh_all_quotas_internal(
    app_handle: Option<tauri::AppHandle>,
) -> Result<RefreshStats, String> {
    let stats = modules::account::refresh_all_quotas_logic().await?;

    // 发送全局刷新事件给 UI (如果需要)
    if let Some(handle) = app_handle {
        let _ = handle.emit("accounts://refreshed", ());
    }

    Ok(stats)
}

/// 刷新所有账号配额 (Tauri Command)
#[tauri::command]
pub async fn refresh_all_quotas(app_handle: tauri::AppHandle) -> Result<RefreshStats, String> {
    refresh_all_quotas_internal(Some(app_handle)).await
}

/// 获取设备指纹（当前 storage.json + 账号绑定）
#[tauri::command]
pub async fn get_device_profiles(
    account_id: String,
) -> Result<modules::account::DeviceProfiles, String> {
    modules::get_device_profiles(&account_id)
}

/// 绑定设备指纹（capture: 采集当前；generate: 生成新指纹），并写入 storage.json
#[tauri::command]
pub async fn bind_device_profile(
    account_id: String,
    mode: String,
) -> Result<crate::models::DeviceProfile, String> {
    modules::bind_device_profile(&account_id, &mode)
}

/// 预览生成一个指纹（不落盘）
#[tauri::command]
pub async fn preview_generate_profile() -> Result<crate::models::DeviceProfile, String> {
    Ok(crate::modules::device::generate_profile())
}

/// 使用给定指纹直接绑定
#[tauri::command]
pub async fn bind_device_profile_with_profile(
    account_id: String,
    profile: crate::models::DeviceProfile,
) -> Result<crate::models::DeviceProfile, String> {
    modules::bind_device_profile_with_profile(&account_id, profile, Some("generated".to_string()))
}

/// 将账号已绑定的指纹应用到 storage.json
#[tauri::command]
pub async fn apply_device_profile(
    account_id: String,
) -> Result<crate::models::DeviceProfile, String> {
    modules::apply_device_profile(&account_id)
}

/// 恢复最早的 storage.json 备份（近似“原始”状态）
#[tauri::command]
pub async fn restore_original_device() -> Result<String, String> {
    modules::restore_original_device()
}

/// 列出指纹版本
#[tauri::command]
pub async fn list_device_versions(
    account_id: String,
) -> Result<modules::account::DeviceProfiles, String> {
    modules::list_device_versions(&account_id)
}

/// 按版本恢复指纹
#[tauri::command]
pub async fn restore_device_version(
    account_id: String,
    version_id: String,
) -> Result<crate::models::DeviceProfile, String> {
    modules::restore_device_version(&account_id, &version_id)
}

/// 删除历史指纹（baseline 不可删）
#[tauri::command]
pub async fn delete_device_version(account_id: String, version_id: String) -> Result<(), String> {
    modules::delete_device_version(&account_id, &version_id)
}

/// 打开设备存储目录
#[tauri::command]
pub async fn open_device_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = modules::device::get_storage_dir()?;
    let dir_str = dir
        .to_str()
        .ok_or("无法解析存储目录路径为字符串")?
        .to_string();
    app.opener()
        .open_path(dir_str, None::<&str>)
        .map_err(|e| format!("打开目录失败: {}", e))
}

/// 加载配置
#[tauri::command]
pub async fn load_config() -> Result<AppConfig, String> {
    modules::load_app_config()
}

/// 兼容别名：获取配置 (load_config)
#[tauri::command]
pub async fn get_config() -> Result<AppConfig, String> {
    load_config().await
}

/// 保存配置
#[tauri::command]
pub async fn save_config(app: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    modules::save_app_config(&config)?;

    // 通知托盘配置已更新
    let _ = app.emit("config://updated", ());

    Ok(())
}

// --- OAuth 命令 ---

#[tauri::command]
pub async fn start_oauth_login(
    app_handle: tauri::AppHandle,
    oauth_client_key: Option<String>,
) -> Result<AccountView, String> {
    modules::logger::log_info("开始 OAuth 授权流程...");
    let service = modules::account_service::AccountService::new(
        crate::modules::integration::SystemManager::Desktop(app_handle.clone()),
    );

    let mut account = service.start_oauth_login(oauth_client_key).await?;

    // 自动触发刷新额度
    let _ = internal_refresh_account_quota(&app_handle, &mut account).await;

    Ok(account.into())
}

/// 完成 OAuth 授权（不自动打开浏览器）
#[tauri::command]
pub async fn complete_oauth_login(app_handle: tauri::AppHandle) -> Result<AccountView, String> {
    modules::logger::log_info("完成 OAuth 授权流程 (manual)...");
    let service = modules::account_service::AccountService::new(
        crate::modules::integration::SystemManager::Desktop(app_handle.clone()),
    );

    let mut account = service.complete_oauth_login().await?;

    // 自动触发刷新额度
    let _ = internal_refresh_account_quota(&app_handle, &mut account).await;

    Ok(account.into())
}

/// 预生成 OAuth 授权链接 (不打开浏览器)
#[tauri::command]
pub async fn prepare_oauth_url(
    app_handle: tauri::AppHandle,
    oauth_client_key: Option<String>,
) -> Result<String, String> {
    let service = modules::account_service::AccountService::new(
        crate::modules::integration::SystemManager::Desktop(app_handle.clone()),
    );
    service.prepare_oauth_url(oauth_client_key).await
}

#[tauri::command]
pub async fn cancel_oauth_login() -> Result<(), String> {
    modules::oauth_server::cancel_oauth_flow();
    Ok(())
}

/// 手动提交 OAuth Code（用于本地回调无法自动完成时）。
#[tauri::command]
pub async fn submit_oauth_code(code: String, state: Option<String>) -> Result<(), String> {
    modules::logger::log_info("收到手动提交 OAuth Code 请求");
    modules::oauth_server::submit_oauth_code(code, state).await
}

#[tauri::command]
pub async fn list_oauth_clients(
) -> Result<Vec<crate::modules::oauth::OAuthClientDescriptor>, String> {
    crate::modules::oauth::list_oauth_clients()
}

#[tauri::command]
pub async fn get_active_oauth_client() -> Result<String, String> {
    crate::modules::oauth::get_active_oauth_client_key()
}

#[tauri::command]
pub async fn set_active_oauth_client(client_key: String) -> Result<(), String> {
    crate::modules::oauth::set_active_oauth_client_key(&client_key)
}

// --- 导入命令 ---

#[tauri::command]
pub async fn import_v1_accounts(app: tauri::AppHandle) -> Result<Vec<AccountView>, String> {
    let accounts = modules::migration::import_from_v1().await?;

    // 对导入的账号尝试刷新一波
    for mut account in accounts.clone() {
        let _ = internal_refresh_account_quota(&app, &mut account).await;
    }

    Ok(accounts.into_iter().map(AccountView::from).collect())
}

#[tauri::command]
pub async fn import_from_db(
    app: tauri::AppHandle,
    target_ide: Option<String>,
) -> Result<Vec<AccountView>, String> {
    let imported_accounts =
        modules::migration::import_all_local_accounts(target_ide.as_deref()).await?;

    for mut account in imported_accounts.clone() {
        let _ = internal_refresh_account_quota(&app, &mut account).await;
    }

    crate::modules::tray::update_tray_menus(&app);

    Ok(imported_accounts
        .into_iter()
        .map(AccountView::from)
        .collect())
}

#[tauri::command]
#[allow(dead_code)]
pub async fn import_custom_db(app: tauri::AppHandle, path: String) -> Result<AccountView, String> {
    // 调用重构后的自定义导入函数
    let mut account = modules::migration::import_from_custom_db_path(path).await?;

    // 自动触发刷新额度
    let _ = internal_refresh_account_quota(&app, &mut account).await;

    // 刷新托盘图标展示
    crate::modules::tray::update_tray_menus(&app);

    Ok(account.into())
}

#[tauri::command]
pub async fn scan_local_accounts(
    custom_db_path: Option<String>,
) -> Result<Vec<modules::migration::LocalAccountPreview>, String> {
    modules::migration::scan_local_accounts(custom_db_path.as_deref()).await
}

#[tauri::command]
pub fn clear_local_account_scan() {
    modules::migration::clear_local_scan();
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalImportResult {
    pub imported: Vec<String>,
    pub failed: Vec<LocalImportFailure>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalImportFailure {
    pub source: String,
    pub message: String,
}

#[tauri::command]
pub async fn import_selected_local_accounts(
    app: tauri::AppHandle,
    candidate_ids: Vec<String>,
) -> Result<LocalImportResult, String> {
    let selected = modules::migration::take_selected_local_candidates(&candidate_ids)?;
    let mut result = LocalImportResult {
        imported: Vec::new(),
        failed: Vec::new(),
    };
    for candidate in selected {
        match modules::migration::import_oauth_state(candidate.oauth_state).await {
            Ok(mut account) => {
                let _ = internal_refresh_account_quota(&app, &mut account).await;
                result.imported.push(account.email);
            }
            Err(_) => result.failed.push(LocalImportFailure {
                source: candidate.source,
                message: "账号凭据无法验证，请在 Antigravity 中重新登录后重试".to_string(),
            }),
        }
    }
    crate::modules::tray::update_tray_menus(&app);
    Ok(result)
}

#[tauri::command]
pub async fn sync_account_from_db(app: tauri::AppHandle) -> Result<Option<AccountView>, String> {
    // Check if the current target is one we should not sync (like agy CLI)
    let index = modules::account::load_account_index()?;
    let current_target = index.current_target_ide.as_deref();
    if current_target == Some("agy") {
        modules::logger::log_info("Auto-sync skipped: current target is agy CLI");
        return Ok(None);
    }

    // 1. 获取 DB 中的 Refresh Token
    let db_refresh_token = match modules::migration::get_refresh_token_from_db(current_target) {
        Ok(token) => token,
        Err(e) => {
            modules::logger::log_info(&format!("自动同步跳过: {}", e));
            return Ok(None);
        }
    };

    // 2. 获取 Manager 当前账号
    let curr_account = modules::account::get_current_account()?;

    // 3. 对比：如果 Refresh Token 相同，说明账号没变，无需导入
    if let Some(acc) = curr_account {
        if acc.token.refresh_token == db_refresh_token {
            return Ok(None);
        }
        modules::logger::log_info(&format!(
            "检测到账号切换 ({} -> DB新账号)，正在同步...",
            acc.email
        ));
    } else {
        modules::logger::log_info("检测到新登录账号，正在自动同步...");
    }

    // 4. 执行完整导入
    let mut account = modules::migration::import_from_db(current_target).await?;

    // 既然是从数据库导入，自动将其设为 Manager 的当前账号并保留当前 target
    let account_id = account.id.clone();
    modules::account::set_current_account_id_with_target(&account_id, current_target)?;

    // 自动触发刷新额度
    let _ = internal_refresh_account_quota(&app, &mut account).await;

    // 刷新托盘图标展示
    crate::modules::tray::update_tray_menus(&app);

    Ok(Some(account.into()))
}

/// Only a path selected in the native dialog may be read for account import.
#[tauri::command]
pub async fn pick_account_import_json(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("JSON", &["json"])
        .pick_file(move |path| {
            let _ = sender.send(path);
        });
    let Some(selected) = receiver.await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|e| e.to_string())?;
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > 2 * 1024 * 1024 {
        return Err("invalid_import_file".to_string());
    }
    std::fs::read_to_string(path)
        .map(Some)
        .map_err(|e| format!("read_import_file_failed: {}", e))
}

/// Export credentials only after a native save dialog; never return tokens over IPC.
#[tauri::command]
pub async fn export_accounts_to_file(
    app: tauri::AppHandle,
    account_ids: Vec<String>,
) -> Result<bool, String> {
    if account_ids.is_empty() {
        return Err("no_accounts_selected".to_string());
    }
    let response = modules::account::export_accounts_by_ids(&account_ids)?;
    if response.accounts.len() != account_ids.len() {
        return Err("account_not_found".to_string());
    }
    let suggested_name = if response.accounts.len() == 1 {
        format!(
            "amt_{}.json",
            response.accounts[0]
                .email
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-') {
                    c
                } else {
                    '_'
                })
                .collect::<String>()
        )
    } else {
        "amt_accounts.json".to_string()
    };
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let mut dialog = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name(suggested_name);
    if let Ok(config) = modules::load_app_config() {
        if let Some(directory) = config.default_export_path {
            let path = PathBuf::from(directory);
            if path.is_dir() {
                dialog = dialog.set_directory(path);
            }
        }
    }
    dialog.save_file(move |path| {
        let _ = sender.send(path);
    });
    let Some(selected) = receiver.await.map_err(|e| e.to_string())? else {
        return Ok(false);
    };
    let path = selected.into_path().map_err(|e| e.to_string())?;
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
    {
        return Err("invalid_export_path".to_string());
    }
    let content = serde_json::to_vec_pretty(&response.accounts).map_err(|e| e.to_string())?;
    crate::utils::fs::write_atomic(path, &content)?;
    Ok(true)
}

/// 清理日志缓存
#[tauri::command]
pub async fn clear_log_cache() -> Result<(), String> {
    modules::logger::clear_logs()
}

/// 清理 Antigravity 应用缓存
/// 用于解决登录失败、版本验证错误等问题
#[tauri::command]
pub async fn clear_antigravity_cache() -> Result<modules::cache::ClearResult, String> {
    modules::cache::clear_antigravity_cache(None)
}

/// 获取 Antigravity 缓存路径列表（用于预览）
#[tauri::command]
pub async fn get_antigravity_cache_paths() -> Result<Vec<String>, String> {
    Ok(modules::cache::get_existing_cache_paths()
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

/// 打开数据目录
#[tauri::command]
pub async fn open_data_folder() -> Result<(), String> {
    let path = modules::account::get_data_dir()?;

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        use crate::utils::command::CommandExtWrapper;
        std::process::Command::new("explorer")
            .creation_flags_windows()
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }

    Ok(())
}

/// 获取数据目录绝对路径
#[tauri::command]
pub async fn get_data_dir_path() -> Result<String, String> {
    let path = modules::account::get_data_dir()?;
    Ok(modules::account::format_data_dir_path(&path))
}

/// 选择并迁移数据目录
#[tauri::command]
pub async fn set_data_dir(path: String) -> Result<String, String> {
    let new_path = tokio::task::spawn_blocking(move || {
        modules::account::migrate_data_dir(PathBuf::from(path))
    })
    .await
    .map_err(|e| format!("迁移任务失败: {}", e))??;

    Ok(modules::account::format_data_dir_path(&new_path))
}

/// 显示主窗口
#[tauri::command]
pub async fn show_main_window(window: tauri::Window) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())
}

/// 设置窗口主题（用于同步 Windows 标题栏按钮颜色）
#[tauri::command]
pub async fn set_window_theme(window: tauri::Window, theme: String) -> Result<(), String> {
    use tauri::Theme;

    let tauri_theme = match theme.as_str() {
        "dark" => Some(Theme::Dark),
        "light" => Some(Theme::Light),
        _ => None, // system default
    };

    window.set_theme(tauri_theme).map_err(|e| e.to_string())
}

/// 获取 Antigravity 可执行文件路径
#[tauri::command]
pub async fn get_antigravity_path(bypass_config: Option<bool>) -> Result<String, String> {
    // 1. 优先从配置查询 (除非明确要求绕过)
    if bypass_config != Some(true) {
        if let Ok(config) = crate::modules::config::load_app_config() {
            if let Some(path) = config.antigravity_executable {
                if std::path::Path::new(&path).exists() {
                    return Ok(path);
                }
            }
        }
    }

    // 2. 执行实时探测
    match crate::modules::process::get_antigravity_executable_path(None) {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Err("未找到 Antigravity 安装路径".to_string()),
    }
}

/// 获取 Antigravity 启动参数
#[tauri::command]
pub async fn get_antigravity_args() -> Result<Vec<String>, String> {
    match crate::modules::process::get_args_from_running_process(None) {
        Some(args) => Ok(args),
        None => Err("未找到正在运行的 Antigravity 进程".to_string()),
    }
}

/// 检测更新响应结构
pub use crate::modules::update_checker::UpdateInfo;

/// 检测 GitHub releases 更新
#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    modules::logger::log_info("收到前端触发的更新检查请求");
    crate::modules::update_checker::check_for_updates().await
}

#[tauri::command]
pub async fn should_check_updates() -> Result<bool, String> {
    let settings = crate::modules::update_checker::load_update_settings()?;
    Ok(crate::modules::update_checker::should_check_for_updates(
        &settings,
    ))
}

#[tauri::command]
pub async fn update_last_check_time() -> Result<(), String> {
    crate::modules::update_checker::update_last_check_time()
}

/// 检测是否通过 Homebrew Cask 安装
#[tauri::command]
pub async fn check_homebrew_installation() -> Result<bool, String> {
    Ok(crate::modules::update_checker::is_homebrew_installed())
}

/// 检测是否以 AppImage 方式运行（Linux 专用）
#[tauri::command]
pub async fn check_appimage_installation() -> Result<bool, String> {
    Ok(crate::modules::update_checker::is_appimage_running())
}

/// 通过 Homebrew Cask 升级应用
#[tauri::command]
pub async fn brew_upgrade_cask() -> Result<String, String> {
    modules::logger::log_info("收到前端触发的 Homebrew 升级请求");
    crate::modules::update_checker::brew_upgrade_cask().await
}

/// 获取更新设置
#[tauri::command]
pub async fn get_update_settings() -> Result<crate::modules::update_checker::UpdateSettings, String>
{
    crate::modules::update_checker::load_update_settings()
}

/// 保存更新设置
#[tauri::command]
pub async fn save_update_settings(
    settings: crate::modules::update_checker::UpdateSettings,
) -> Result<(), String> {
    crate::modules::update_checker::save_update_settings(&settings)
}

/// 预热所有可用账号
#[tauri::command]
pub async fn warm_up_all_accounts() -> Result<String, String> {
    modules::quota::warm_up_all_accounts().await
}

/// 预热指定账号
#[tauri::command]
pub async fn warm_up_account(account_id: String) -> Result<String, String> {
    modules::quota::warm_up_account(&account_id).await
}

/// 更新账号自定义标签
#[tauri::command]
pub async fn update_account_label(account_id: String, label: String) -> Result<(), String> {
    if label.chars().count() > 15 {
        return Err("标签长度不能超过15个字符".to_string());
    }
    if !account_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
        || !modules::account::load_account_index()?
            .accounts
            .iter()
            .any(|account| account.id == account_id)
    {
        return Err("账号不存在".to_string());
    }
    let mut account = modules::account::load_account(&account_id)?;
    account.custom_label = if label.is_empty() { None } else { Some(label) };
    modules::account::save_account(&account)
}
