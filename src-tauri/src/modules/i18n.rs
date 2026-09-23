use serde_json::Value;
use std::collections::HashMap;

/// Choose the first supported OS language when creating a new configuration.
/// Saved configurations keep their explicit language selection.
pub fn default_language() -> String {
    language_from_locales(sys_locale::get_locales()).to_string()
}

fn language_from_locales(locales: impl IntoIterator<Item = impl AsRef<str>>) -> &'static str {
    locales
        .into_iter()
        .find_map(|locale| supported_language(locale.as_ref()))
        .unwrap_or("en")
}

/// Normalize OS locale tags to the identifiers shared by the UI and tray menu.
fn supported_language(locale: &str) -> Option<&'static str> {
    let locale = locale
        .trim()
        .split(['.', '@'])
        .next()?
        .replace('_', "-")
        .to_ascii_lowercase();
    match locale.split('-').next()? {
        "zh" => Some("zh"),
        "en" => Some("en"),
        _ => None,
    }
}

/// Normalize old saved selections before returning config to the UI or tray.
pub fn normalize_language(language: &str) -> &'static str {
    supported_language(language).unwrap_or("en")
}

/// Tray text structure
#[derive(Debug, Clone)]
pub struct TrayTexts {
    pub current: String,
    pub relay_to: String,
    pub no_relay: String,
    pub switching: String,
    pub refreshing: String,
    pub refresh_current: String,
    pub show_window: String,
    pub quit: String,
    pub no_account: String,
    pub account_attention: String,
    pub switch_failed: String,
    pub refresh_failed: String,
}

/// Load translations from JSON
fn load_translations(lang: &str) -> HashMap<String, String> {
    let json_content = match normalize_language(lang) {
        "zh" => include_str!("../../../src/locales/zh.json"),
        _ => include_str!("../../../src/locales/en.json"),
    };

    let v: Value = serde_json::from_str(json_content).unwrap_or_else(|_| serde_json::json!({}));

    let mut map = HashMap::new();

    if let Some(tray) = v.get("tray").and_then(|t| t.as_object()) {
        for (key, value) in tray {
            if let Some(s) = value.as_str() {
                map.insert(key.clone(), s.to_string());
            }
        }
    }

    map
}

/// Get tray texts (based on language)
pub fn get_tray_texts(lang: &str) -> TrayTexts {
    let t = load_translations(lang);

    TrayTexts {
        current: t
            .get("current")
            .cloned()
            .unwrap_or_else(|| "Current".to_string()),
        relay_to: t
            .get("relay_to")
            .cloned()
            .unwrap_or_else(|| "Relay to".to_string()),
        no_relay: t
            .get("no_relay")
            .cloned()
            .unwrap_or_else(|| "No relay account".to_string()),
        switching: t
            .get("switching")
            .cloned()
            .unwrap_or_else(|| "Switching...".to_string()),
        refreshing: t
            .get("refreshing")
            .cloned()
            .unwrap_or_else(|| "Refreshing...".to_string()),
        refresh_current: t
            .get("refresh_current")
            .cloned()
            .unwrap_or_else(|| "Refresh Current Quota".to_string()),
        show_window: t
            .get("show_window")
            .cloned()
            .unwrap_or_else(|| "Show Main Window".to_string()),
        quit: t
            .get("quit")
            .cloned()
            .unwrap_or_else(|| "Quit Application".to_string()),
        no_account: t
            .get("no_account")
            .cloned()
            .unwrap_or_else(|| "No Account".to_string()),
        account_attention: t
            .get("account_attention")
            .cloned()
            .unwrap_or_else(|| "Needs attention".to_string()),
        switch_failed: t
            .get("switch_failed")
            .cloned()
            .unwrap_or_else(|| "Switch failed · Open main window".to_string()),
        refresh_failed: t
            .get("refresh_failed")
            .cloned()
            .unwrap_or_else(|| "Refresh failed · Open main window".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::{get_tray_texts, language_from_locales, normalize_language};

    #[test]
    fn detects_supported_languages_from_os_locale_tags() {
        for (locale, expected) in [
            ("en-US", "en"),
            ("en-GB", "en"),
            ("zh-CN", "zh"),
            ("zh-Hant-TW", "zh"),
            ("ZH_hk.UTF-8", "zh"),
        ] {
            assert_eq!(language_from_locales([locale]), expected, "{locale}");
        }
    }

    #[test]
    fn old_chinese_selections_use_simplified_chinese() {
        for locale in [
            "zh", "zh-CN", "zh-SG", "zh-Hans", "zh-TW", "zh-HK", "zh-MO", "zh-Hant",
        ] {
            assert_eq!(normalize_language(locale), "zh", "{locale}");
        }
    }

    #[test]
    fn honors_preference_order_and_skips_unsupported_languages() {
        assert_eq!(language_from_locales(["de-DE", "ru-RU", "en-US"]), "en");
        assert_eq!(language_from_locales(["en-GB", "zh-CN"]), "en");
        assert_eq!(language_from_locales(["zh-TW", "en-US"]), "zh");
    }

    #[test]
    fn falls_back_to_english_without_a_supported_locale() {
        assert_eq!(language_from_locales(Vec::<String>::new()), "en");
        for locale in ["", "C", "POSIX", "C.UTF-8", "de-DE", "my-MM"] {
            assert_eq!(language_from_locales([locale]), "en", "{locale}");
        }
    }

    #[test]
    fn tray_uses_the_detected_language() {
        let language = language_from_locales(["zh-TW"]);
        let texts = get_tray_texts(language);
        let chinese: serde_json::Value =
            serde_json::from_str(include_str!("../../../src/locales/zh.json")).unwrap();
        assert_eq!(texts.quit, chinese["tray"]["quit"].as_str().unwrap());
    }
}
