use crate::models::DeviceProfile;
use crate::modules::{account, logger, process};
use chrono::Local;
use rand::{distributions::Alphanumeric, Rng};
use rusqlite::Connection;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const GLOBAL_BASELINE: &str = "device_original.json";

fn get_data_dir() -> Result<PathBuf, String> {
    account::get_data_dir()
}

/// Find storage.json path (prefer custom/portable paths)
pub fn get_storage_path(target_ide: Option<&str>) -> Result<PathBuf, String> {
    // 1) --user-data-dir flag
    if let Some(user_data_dir) = process::get_user_data_dir_from_process(target_ide) {
        let path = user_data_dir
            .join("User")
            .join("globalStorage")
            .join("storage.json");
        if path.exists() {
            return Ok(path);
        }
    }

    // 2) Portable mode (based on executable data/user-data)
    if let Some(exe_path) = process::get_antigravity_executable_path(target_ide) {
        if let Some(parent) = exe_path.parent() {
            let portable = parent
                .join("data")
                .join("user-data")
                .join("User")
                .join("globalStorage")
                .join("storage.json");
            if portable.exists() {
                return Ok(portable);
            }
        }
    }

    let folder_names: &[&str] = if target_ide == Some("ide") {
        &["Antigravity IDE"]
    } else if matches!(target_ide, Some("code" | "cursor" | "classic")) {
        &["Antigravity"]
    } else {
        // target_ide = None: 优先查找 Antigravity 经典版，回退查找 Antigravity IDE
        &["Antigravity", "Antigravity IDE"]
    };

    // 3) Standard installation location
    #[cfg(target_os = "macos")]
    {
        let home = dirs::home_dir().ok_or("failed_to_get_home_dir")?;
        for folder_name in folder_names {
            let path = home.join(format!(
                "Library/Application Support/{}/User/globalStorage/storage.json",
                folder_name
            ));
            if path.exists() {
                return Ok(path);
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let appdata =
            std::env::var("APPDATA").map_err(|_| "failed_to_get_appdata_env".to_string())?;
        for folder_name in folder_names {
            let path = PathBuf::from(&appdata)
                .join(folder_name)
                .join("User\\globalStorage\\storage.json");
            if path.exists() {
                return Ok(path);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let home = dirs::home_dir().ok_or("failed_to_get_home_dir")?;
        for folder_name in folder_names {
            let path = home.join(format!(
                ".config/{}/User/globalStorage/storage.json",
                folder_name
            ));
            if path.exists() {
                return Ok(path);
            }
        }
    }

    Err("storage_json_not_found".to_string())
}

/// Get directory of storage.json
pub fn get_storage_dir() -> Result<PathBuf, String> {
    let path = get_storage_path(None)?;
    path.parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "failed_to_get_storage_parent_dir".to_string())
}

/// Get state.vscdb path (same directory as storage.json)
pub fn get_state_db_path() -> Result<PathBuf, String> {
    let dir = get_storage_dir()?;
    Ok(dir.join("state.vscdb"))
}

/// Backup storage.json, returns backup file path
#[allow(dead_code)]
pub fn backup_storage(storage_path: &Path) -> Result<PathBuf, String> {
    if !storage_path.exists() {
        return Err(format!("storage_json_missing: {:?}", storage_path));
    }
    let dir = storage_path
        .parent()
        .ok_or_else(|| "failed_to_get_storage_parent_dir".to_string())?;
    let backup_path = dir.join(format!(
        "storage.json.backup_{}_{}",
        Local::now().format("%Y%m%d_%H%M%S"),
        Uuid::new_v4()
    ));
    let content = fs::read(storage_path).map_err(|e| format!("backup_read_failed: {}", e))?;
    crate::utils::fs::write_atomic(&backup_path, &content)
        .map_err(|e| format!("backup_failed: {}", e))?;
    Ok(backup_path)
}

/// Read current device profile from storage.json
#[allow(dead_code)]
pub fn read_profile(storage_path: &Path) -> Result<DeviceProfile, String> {
    let content = fs::read_to_string(storage_path)
        .map_err(|e| format!("read_failed ({:?}): {}", storage_path, e))?;
    let json: Value = serde_json::from_str(&content)
        .map_err(|e| format!("parse_failed ({:?}): {}", storage_path, e))?;

    // Supports nested telemetry or flat telemetry.xxx
    let get_field = |key: &str| -> Option<String> {
        if let Some(obj) = json.get("telemetry").and_then(|v| v.as_object()) {
            if let Some(v) = obj.get(key).and_then(|v| v.as_str()) {
                return Some(v.to_string());
            }
        }
        if let Some(v) = json
            .get(format!("telemetry.{key}"))
            .and_then(|v| v.as_str())
        {
            return Some(v.to_string());
        }
        None
    };

    Ok(DeviceProfile {
        machine_id: get_field("machineId").ok_or("missing_machine_id")?,
        mac_machine_id: get_field("macMachineId").ok_or("missing_mac_machine_id")?,
        dev_device_id: get_field("devDeviceId").ok_or("missing_dev_device_id")?,
        sqm_id: get_field("sqmId").ok_or("missing_sqm_id")?,
    })
}

/// Write device profile to storage.json
pub fn write_profile(storage_path: &Path, profile: &DeviceProfile) -> Result<(), String> {
    let data_dir = get_data_dir()?;
    write_profile_file(storage_path, profile, &data_dir)?;
    sync_state_service_machine_id_value(&profile.dev_device_id)
}

fn write_profile_file(
    storage_path: &Path,
    profile: &DeviceProfile,
    data_dir: &Path,
) -> Result<(), String> {
    if !storage_path.exists() {
        return Err(format!("storage_json_missing: {:?}", storage_path));
    }

    let content = fs::read_to_string(storage_path).map_err(|e| format!("read_failed: {}", e))?;
    let mut json: Value =
        serde_json::from_str(&content).map_err(|e| format!("parse_failed: {}", e))?;

    // Ensure telemetry is an object
    if !json.get("telemetry").is_some_and(|v| v.is_object()) {
        if json.as_object_mut().is_some() {
            json["telemetry"] = serde_json::json!({});
        } else {
            return Err("json_top_level_not_object".to_string());
        }
    }

    if let Some(telemetry) = json.get_mut("telemetry").and_then(|v| v.as_object_mut()) {
        telemetry.insert(
            "machineId".to_string(),
            Value::String(profile.machine_id.clone()),
        );
        telemetry.insert(
            "macMachineId".to_string(),
            Value::String(profile.mac_machine_id.clone()),
        );
        telemetry.insert(
            "devDeviceId".to_string(),
            Value::String(profile.dev_device_id.clone()),
        );
        telemetry.insert("sqmId".to_string(), Value::String(profile.sqm_id.clone()));
    } else {
        return Err("telemetry_not_object".to_string());
    }

    // Write flat keys as well, compatible with old formats
    if let Some(map) = json.as_object_mut() {
        map.insert(
            "telemetry.machineId".to_string(),
            Value::String(profile.machine_id.clone()),
        );
        map.insert(
            "telemetry.macMachineId".to_string(),
            Value::String(profile.mac_machine_id.clone()),
        );
        map.insert(
            "telemetry.devDeviceId".to_string(),
            Value::String(profile.dev_device_id.clone()),
        );
        map.insert(
            "telemetry.sqmId".to_string(),
            Value::String(profile.sqm_id.clone()),
        );
    }

    // Sync storage.serviceMachineId (match with devDeviceId), place at root level
    if let Some(map) = json.as_object_mut() {
        map.insert(
            "storage.serviceMachineId".to_string(),
            Value::String(profile.dev_device_id.clone()),
        );
    }

    let updated =
        serde_json::to_string_pretty(&json).map_err(|e| format!("serialize_failed: {}", e))?;
    if load_global_original_in_dir(data_dir).is_none() {
        if let Ok(original) = read_profile(storage_path) {
            save_global_original_in_dir(data_dir, &original)?;
        }
    }
    backup_storage(storage_path)?;
    crate::utils::fs::write_atomic(storage_path, updated.as_bytes())
        .map_err(|e| format!("write_failed ({:?}): {}", storage_path, e))?;
    logger::log_info(&format!("device_profile_written to {:?}", storage_path));

    Ok(())
}

/// Only sync serviceMachineId, don't change other fields
#[allow(dead_code)]
pub fn sync_service_machine_id(storage_path: &Path, service_id: &str) -> Result<(), String> {
    let content = fs::read_to_string(storage_path).map_err(|e| format!("read_failed: {}", e))?;
    let mut json: Value =
        serde_json::from_str(&content).map_err(|e| format!("parse_failed: {}", e))?;

    if let Some(map) = json.as_object_mut() {
        map.insert(
            "storage.serviceMachineId".to_string(),
            Value::String(service_id.to_string()),
        );
    }

    let updated =
        serde_json::to_string_pretty(&json).map_err(|e| format!("serialize_failed: {}", e))?;
    backup_storage(storage_path)?;
    crate::utils::fs::write_atomic(storage_path, updated.as_bytes())
        .map_err(|e| format!("write_failed: {}", e))?;
    logger::log_info("service_machine_id_synced");

    sync_state_service_machine_id_value(service_id)
}

/// Read serviceMachineId from storage.json (fallback to devDeviceId), sync back if missing and sync state.vscdb
#[allow(dead_code)]
pub fn sync_service_machine_id_from_storage(storage_path: &Path) -> Result<(), String> {
    if !storage_path.exists() {
        return Err("storage_json_missing".to_string());
    }
    let content = fs::read_to_string(storage_path).map_err(|e| format!("read_failed: {}", e))?;
    let mut json: Value =
        serde_json::from_str(&content).map_err(|e| format!("parse_failed: {}", e))?;

    let service_id = json
        .get("storage.serviceMachineId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            json.get("telemetry")
                .and_then(|t| t.get("devDeviceId"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .or_else(|| {
            json.get("telemetry.devDeviceId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .ok_or("missing_ids_in_storage")?;

    let mut dirty = false;
    if json
        .get("storage.serviceMachineId")
        .and_then(|v| v.as_str())
        .is_none()
    {
        if let Some(map) = json.as_object_mut() {
            map.insert(
                "storage.serviceMachineId".to_string(),
                Value::String(service_id.clone()),
            );
            dirty = true;
        }
    }

    if dirty {
        let updated =
            serde_json::to_string_pretty(&json).map_err(|e| format!("serialize_failed: {}", e))?;
        backup_storage(storage_path)?;
        crate::utils::fs::write_atomic(storage_path, updated.as_bytes())
            .map_err(|e| format!("write_failed: {}", e))?;
        logger::log_info("service_machine_id_added");
    }

    sync_state_service_machine_id_value(&service_id)
}

fn sync_state_service_machine_id_value(service_id: &str) -> Result<(), String> {
    let db_path = get_state_db_path()?;
    if !db_path.exists() {
        logger::log_warn(&format!("state_db_missing: {:?}", db_path));
        return Ok(());
    }

    let conn = Connection::open(&db_path).map_err(|e| format!("db_open_failed: {}", e))?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ItemTable (key TEXT PRIMARY KEY, value TEXT);",
        [],
    )
    .map_err(|e| format!("failed_to_create_item_table: {}", e))?;
    conn.execute(
        "INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('storage.serviceMachineId', ?1);",
        [service_id],
    )
    .map_err(|e| format!("failed_to_write_to_db: {}", e))?;
    logger::log_info("service_machine_id_synced_to_db");
    Ok(())
}

/// Load/Save global original profile (shared across all accounts)
pub fn load_global_original() -> Option<DeviceProfile> {
    get_data_dir()
        .ok()
        .and_then(|dir| load_global_original_in_dir(&dir))
}

pub fn save_global_original(profile: &DeviceProfile) -> Result<(), String> {
    let dir = get_data_dir()?;
    save_global_original_in_dir(&dir, profile)
}

fn load_global_original_in_dir(dir: &Path) -> Option<DeviceProfile> {
    let content = fs::read_to_string(dir.join(GLOBAL_BASELINE)).ok()?;
    serde_json::from_str(&content).ok()
}

fn save_global_original_in_dir(dir: &Path, profile: &DeviceProfile) -> Result<(), String> {
    let path = dir.join(GLOBAL_BASELINE);
    if path.exists() {
        return Ok(()); // already exists, don't overwrite
    }
    let content =
        serde_json::to_string_pretty(profile).map_err(|e| format!("serialize_failed: {}", e))?;
    crate::utils::fs::write_atomic(&path, content.as_bytes())
        .map_err(|e| format!("write_failed: {}", e))
}

/// List storage.json backups in current directory (descending by time)
#[allow(dead_code)]
pub fn list_backups(storage_path: &Path) -> Result<Vec<PathBuf>, String> {
    let dir = storage_path
        .parent()
        .ok_or_else(|| "failed_to_get_storage_parent_dir".to_string())?;
    let mut backups = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("storage.json.backup_") {
                    backups.push(path);
                }
            }
        }
    }
    // Sort by modification time (new to old)
    backups.sort_by(|a, b| {
        let ma = fs::metadata(a).and_then(|m| m.modified()).ok();
        let mb = fs::metadata(b).and_then(|m| m.modified()).ok();
        mb.cmp(&ma)
    });
    Ok(backups)
}

/// Restore backup to storage.json. If use_oldest=true, use oldest backup, else use latest.
#[allow(dead_code)]
pub fn restore_backup(storage_path: &Path, use_oldest: bool) -> Result<PathBuf, String> {
    let backups = list_backups(storage_path)?;
    if backups.is_empty() {
        return Err("no_backups_found".to_string());
    }
    let target = if use_oldest {
        backups.last().unwrap().clone()
    } else {
        backups.first().unwrap().clone()
    };
    // backup current first
    let _ = backup_storage(storage_path)?;
    let content = fs::read(&target).map_err(|e| format!("restore_read_failed: {}", e))?;
    crate::utils::fs::write_atomic(storage_path, &content)
        .map_err(|e| format!("restore_failed: {}", e))?;
    logger::log_info(&format!("storage_json_restored: {:?}", target));
    Ok(target)
}

/// Generate a new set of device fingerprints (Cursor/VSCode style)
pub fn generate_profile() -> DeviceProfile {
    DeviceProfile {
        machine_id: format!("auth0|user_{}", random_hex(32)),
        mac_machine_id: new_standard_machine_id(),
        dev_device_id: Uuid::new_v4().to_string(),
        sqm_id: format!("{{{}}}", Uuid::new_v4().to_string().to_uppercase()),
    }
}

fn random_hex(length: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect::<String>()
        .to_lowercase()
}

fn new_standard_machine_id() -> String {
    // xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (y in 8..b)
    let mut rng = rand::thread_rng();
    let mut id = String::with_capacity(36);
    for ch in "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".chars() {
        if ch == '-' || ch == '4' {
            id.push(ch);
        } else if ch == 'x' {
            id.push_str(&format!("{:x}", rng.gen_range(0..16)));
        } else if ch == 'y' {
            id.push_str(&format!("{:x}", rng.gen_range(8..12)));
        }
    }
    id
}

#[cfg(test)]
mod safety_tests {
    use super::*;

    #[test]
    fn profile_write_keeps_full_backup_and_original_baseline() {
        let temp = tempfile::tempdir().unwrap();
        let storage_path = temp.path().join("storage.json");
        let data_dir = temp.path().join("amt");
        fs::create_dir(&data_dir).unwrap();
        let original = DeviceProfile {
            machine_id: "original-machine".into(),
            mac_machine_id: "original-mac".into(),
            dev_device_id: "original-device".into(),
            sqm_id: "original-sqm".into(),
        };
        let original_file = serde_json::json!({
            "telemetry": {
                "machineId": original.machine_id,
                "macMachineId": original.mac_machine_id,
                "devDeviceId": original.dev_device_id,
                "sqmId": original.sqm_id,
            },
            "unrelatedSetting": "preserve-me"
        })
        .to_string();
        fs::write(&storage_path, &original_file).unwrap();
        let replacement = DeviceProfile {
            machine_id: "new-machine".into(),
            mac_machine_id: "new-mac".into(),
            dev_device_id: "new-device".into(),
            sqm_id: "new-sqm".into(),
        };

        write_profile_file(&storage_path, &replacement, &data_dir).unwrap();
        let backups = list_backups(&storage_path).unwrap();
        assert_eq!(backups.len(), 1);
        assert_eq!(fs::read_to_string(&backups[0]).unwrap(), original_file);
        assert_eq!(
            load_global_original_in_dir(&data_dir).unwrap().machine_id,
            "original-machine"
        );
        let updated: Value = serde_json::from_slice(&fs::read(&storage_path).unwrap()).unwrap();
        assert_eq!(updated["telemetry"]["machineId"], "new-machine");
        assert_eq!(updated["unrelatedSetting"], "preserve-me");

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&storage_path).unwrap().permissions().mode() & 0o777,
                0o600
            );
            assert_eq!(
                fs::metadata(&backups[0]).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }
}
