use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UpstreamProxyConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub url: String,
}

/// Application configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub language: String,
    pub theme: String,
    pub auto_refresh: bool,
    pub refresh_interval: i32, // minutes
    pub auto_sync: bool,
    pub sync_interval: i32, // minutes
    pub default_export_path: Option<String>,
    #[serde(default)]
    pub network_proxy: UpstreamProxyConfig,
    pub antigravity_executable: Option<String>, // Manually specified Antigravity executable path
    pub antigravity_ide_executable: Option<String>, // Legacy IDE path for process protection only
    pub antigravity_args: Option<Vec<String>>,  // Antigravity startup arguments
    #[serde(default)]
    pub auto_launch: bool, // Launch on startup
    #[serde(default)]
    pub scheduled_warmup: ScheduledWarmupConfig,
}

/// Scheduled warmup configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledWarmupConfig {
    /// Whether smart warmup is enabled
    pub enabled: bool,

    /// List of models to warmup
    #[serde(default = "default_warmup_models")]
    pub monitored_models: Vec<String>,
}

fn default_warmup_models() -> Vec<String> {
    vec![
        "gemini-3-flash".to_string(),
        "claude".to_string(),
        "gemini-3-pro-high".to_string(),
        "gemini-3.1-flash-image".to_string(),
    ]
}

impl ScheduledWarmupConfig {
    pub fn new() -> Self {
        Self {
            enabled: false,
            monitored_models: default_warmup_models(),
        }
    }
}

impl Default for ScheduledWarmupConfig {
    fn default() -> Self {
        Self::new()
    }
}

impl AppConfig {
    pub fn new() -> Self {
        Self {
            language: crate::modules::i18n::default_language(),
            theme: "system".to_string(),
            auto_refresh: true,
            refresh_interval: 15,
            auto_sync: false,
            sync_interval: 5,
            default_export_path: None,
            network_proxy: UpstreamProxyConfig::default(),
            antigravity_executable: None,
            antigravity_ide_executable: None,
            antigravity_args: None,
            auto_launch: false,
            scheduled_warmup: ScheduledWarmupConfig::default(),
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::AppConfig;

    #[test]
    fn saved_language_is_preserved_when_loading_config() {
        let mut config = AppConfig::new();
        for language in ["en", "zh"] {
            config.language = language.to_string();
            let saved = serde_json::to_string(&config).unwrap();
            let restored: AppConfig = serde_json::from_str(&saved).unwrap();
            assert_eq!(restored.language, language);
        }
    }

    #[test]
    fn old_cli_path_is_dropped_but_ide_process_guard_is_preserved() {
        let mut legacy = serde_json::to_value(AppConfig::new()).unwrap();
        legacy["antigravity_cli_executable"] = serde_json::json!("/tmp/agy");
        legacy["antigravity_ide_executable"] = serde_json::json!("/tmp/antigravity-ide");

        let config: AppConfig = serde_json::from_value(legacy).unwrap();
        let canonical = serde_json::to_value(config).unwrap();
        assert!(canonical.get("antigravity_cli_executable").is_none());
        assert_eq!(
            canonical["antigravity_ide_executable"],
            "/tmp/antigravity-ide"
        );
    }
}
