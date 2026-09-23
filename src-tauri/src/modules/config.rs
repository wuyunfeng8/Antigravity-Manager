use serde_json;
use std::fs;

use super::account::get_data_dir;
use crate::models::AppConfig;

const CONFIG_FILE: &str = "gui_config.json";

fn normalize_config(mut config: AppConfig) -> AppConfig {
    config.language = crate::modules::i18n::normalize_language(&config.language).to_string();
    config
}

/// Load application configuration
pub fn load_app_config() -> Result<AppConfig, String> {
    let data_dir = get_data_dir()?;
    let config_path = data_dir.join(CONFIG_FILE);

    if !config_path.exists() {
        let config = AppConfig::new();
        // Persist a complete default configuration on first launch.
        let _ = save_app_config(&config);
        return Ok(config);
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("failed_to_read_config_file: {}", e))?;

    let mut persisted: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("failed_to_parse_config_file: {}", e))?;
    if persisted.get("network_proxy").is_none() {
        if let Some(legacy) = persisted
            .get("proxy")
            .and_then(|proxy| proxy.get("upstream_proxy"))
            .cloned()
        {
            persisted["network_proxy"] = legacy;
        }
    }
    if let Some(root) = persisted.as_object_mut() {
        root.remove("proxy");
    }
    let config = normalize_config(
        serde_json::from_value(persisted.clone())
            .map_err(|e| format!("failed_to_convert_config_after_migration: {}", e))?,
    );

    // Re-serializing drops all gateway-era fields while preserving the small
    // desktop account-manager configuration that AMT still supports.
    let canonical = serde_json::to_value(&config)
        .map_err(|e| format!("failed_to_serialize_config_for_cleanup: {}", e))?;
    if canonical != persisted {
        let _ = save_app_config(&config);
    }

    Ok(config)
}

/// Save application configuration (atomic write)
pub fn save_app_config(config: &AppConfig) -> Result<(), String> {
    let data_dir = get_data_dir()?;
    let config_path = data_dir.join(CONFIG_FILE);

    let content = serde_json::to_string_pretty(&normalize_config(config.clone()))
        .map_err(|e| format!("failed_to_serialize_config: {}", e))?;

    crate::utils::fs::write_atomic(&config_path, content.as_bytes())
        .map_err(|e| format!("failed_to_save_config: {}", e))
}

#[cfg(test)]
mod tests {
    use super::normalize_config;
    use crate::models::AppConfig;

    #[test]
    fn legacy_language_is_normalized_on_load_and_save() {
        let mut config = AppConfig::new();
        config.language = "zh-TW".into();
        assert_eq!(normalize_config(config.clone()).language, "zh");
        config.language = "ru".into();
        assert_eq!(normalize_config(config).language, "en");
    }
}
