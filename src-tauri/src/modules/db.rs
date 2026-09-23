use crate::utils::protobuf;
use rusqlite::Connection;
use std::path::PathBuf;

fn get_antigravity_path(target_ide: Option<&str>) -> Option<PathBuf> {
    if let Ok(config) = crate::modules::config::load_app_config() {
        if let Some(path_str) = config.antigravity_executable {
            let path = PathBuf::from(path_str);
            if path.exists() {
                return Some(path);
            }
        }
    }
    crate::modules::process::get_antigravity_executable_path(target_ide)
}

/// Get all possible Antigravity database candidate paths
pub fn get_all_candidate_db_paths(target_ide: Option<&str>) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(user_data_dir) = crate::modules::process::get_user_data_dir_from_process(target_ide)
    {
        paths.push(
            user_data_dir
                .join("User")
                .join("globalStorage")
                .join("state.vscdb"),
        );
    }

    if let Some(antigravity_path) = get_antigravity_path(target_ide) {
        if let Some(parent_dir) = antigravity_path.parent() {
            paths.push(
                PathBuf::from(parent_dir)
                    .join("data")
                    .join("user-data")
                    .join("User")
                    .join("globalStorage")
                    .join("state.vscdb"),
            );
        }
    }

    let folder_names: &[&str] = if target_ide == Some("ide") {
        &["Antigravity IDE", "Antigravity"]
    } else if target_ide == Some("code") || target_ide == Some("cursor") {
        &["Antigravity", "Antigravity IDE"]
    } else if target_ide == Some("classic") {
        &["Antigravity"]
    } else {
        &["Antigravity", "Antigravity IDE"]
    };

    #[cfg(target_os = "macos")]
    if let Some(home) = dirs::home_dir() {
        for folder_name in folder_names {
            paths.push(home.join(format!(
                "Library/Application Support/{}/User/globalStorage/state.vscdb",
                folder_name
            )));
        }
    }

    #[cfg(target_os = "windows")]
    if let Ok(appdata) = std::env::var("APPDATA") {
        for folder_name in folder_names {
            paths.push(
                PathBuf::from(&appdata)
                    .join(folder_name)
                    .join("User\\globalStorage\\state.vscdb"),
            );
        }
    }

    #[cfg(target_os = "linux")]
    if let Some(home) = dirs::home_dir() {
        for folder_name in folder_names {
            paths.push(home.join(format!(
                ".config/{}/User/globalStorage/state.vscdb",
                folder_name
            )));
        }
    }

    paths
}

/// Get Antigravity database path (cross-platform)
pub fn get_db_path(target_ide: Option<&str>) -> Result<PathBuf, String> {
    let candidates = get_all_candidate_db_paths(target_ide);
    for path in &candidates {
        if path.exists() {
            return Ok(path.clone());
        }
    }
    candidates
        .into_iter()
        .next()
        .ok_or_else(|| "Failed to locate database path".to_string())
}

/// Inject Token and Email into database
#[allow(clippy::too_many_arguments)]
pub fn inject_token(
    db_path: &PathBuf,
    access_token: &str,
    refresh_token: &str,
    expiry: i64,
    email: &str,
    mut is_gcp_tos: bool,
    project_id: Option<&str>,
    id_token: Option<&str>,
    oauth_client_key: Option<&str>,
    _target_ide: Option<&str>,
) -> Result<String, String> {
    crate::modules::logger::log_info("Starting Token injection...");
    if !db_path.is_file() {
        return Err("Antigravity state database does not exist".to_string());
    }

    // 如果使用的是本项目的内置 Client ID (antigravity_enterprise 实际上是标准版)
    // 则强制关闭 GCP TOS 标志，以确保 IDE 使用标准 Client ID 进行刷新
    if let Some(key) = oauth_client_key {
        if key == "antigravity_enterprise" && is_gcp_tos {
            crate::modules::logger::log_info(
                "[DB] Built-in client detected, forcing Standard mode for injection.",
            );
            is_gcp_tos = false;
        }
    }

    crate::modules::logger::log_info(
        "Skipping version detection, using new format injection directly (antigravityUnifiedStateSync.oauthToken)",
    );

    inject_new_format(
        db_path,
        access_token,
        refresh_token,
        expiry,
        email,
        is_gcp_tos,
        project_id,
        id_token,
    )
}

/// New format injection (>= 1.16.5)
#[allow(clippy::too_many_arguments)]
fn inject_new_format(
    db_path: &PathBuf,
    access_token: &str,
    refresh_token: &str,
    expiry: i64,
    email: &str,
    is_gcp_tos: bool,
    project_id: Option<&str>,
    id_token: Option<&str>,
) -> Result<String, String> {
    let mut conn =
        Connection::open_with_flags(db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)
            .map_err(|e| format!("Failed to open database: {}", e))?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start state transaction: {}", e))?;

    // Create OAuthTokenInfo (binary)
    let oauth_info = protobuf::create_oauth_info(
        access_token,
        refresh_token,
        expiry,
        is_gcp_tos,
        id_token,
        Some(email),
    );

    use base64::{engine::general_purpose, Engine as _};
    use rusqlite::OptionalExtension;

    let current_topic = tx
        .query_row(
            "SELECT value FROM ItemTable WHERE key = ?",
            ["antigravityUnifiedStateSync.oauthToken"],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| format!("Failed to read oauthToken: {}", e))?
        .map(|val| {
            general_purpose::STANDARD
                .decode(val)
                .map_err(|e| format!("Failed to decode existing OAuth state: {}", e))
        })
        .transpose()?
        .unwrap_or_default();

    let mut topic =
        protobuf::remove_unified_topic_entry(&current_topic, "oauthTokenInfoSentinelKey")?;
    topic.extend(protobuf::create_unified_topic_entry(
        "oauthTokenInfoSentinelKey",
        &oauth_info,
    ));

    let topic_b64 = general_purpose::STANDARD.encode(&topic);

    tx.execute(
        "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
        ["antigravityUnifiedStateSync.oauthToken", &topic_b64],
    )
    .map_err(|e| format!("Failed to write new format: {}", e))?;

    inject_user_status(&tx, email)?;

    if let Some(project_id) = project_id.map(str::trim).filter(|pid| !pid.is_empty()) {
        inject_enterprise_project_preference(&tx, project_id)?;
    } else {
        clear_enterprise_project_preference(&tx)?;
    }

    // Inject Onboarding flag
    tx.execute(
        "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
        ["antigravityOnboarding", "true"],
    )
    .map_err(|e| format!("Failed to write onboarding flag: {}", e))?;

    // Fix for missing history: Delete the old format state to prevent the IDE from reading a stale UserID
    // which causes history fetching to fail.
    tx.execute(
        "DELETE FROM ItemTable WHERE key = ?",
        ["jetskiStateSync.agentManagerInitState"],
    )
    .map_err(|e| format!("Failed to clear legacy OAuth state: {}", e))?;

    tx.commit()
        .map_err(|e| format!("Failed to commit state transaction: {}", e))?;

    Ok("Token injection successful (new format)".to_string())
}

fn inject_user_status(conn: &Connection, email: &str) -> Result<(), String> {
    let payload = protobuf::create_minimal_user_status_payload(email);
    let entry_b64 = protobuf::create_unified_state_entry("userStatusSentinelKey", &payload);

    conn.execute(
        "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
        ["antigravityUnifiedStateSync.userStatus", &entry_b64],
    )
    .map_err(|e| format!("Failed to write user status: {}", e))?;

    Ok(())
}

fn inject_enterprise_project_preference(conn: &Connection, project_id: &str) -> Result<(), String> {
    let payload = protobuf::create_string_value_payload(project_id);
    let entry_b64 = protobuf::create_unified_state_entry("enterpriseGcpProjectId", &payload);

    conn.execute(
        "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
        [
            "antigravityUnifiedStateSync.enterprisePreferences",
            &entry_b64,
        ],
    )
    .map_err(|e| format!("Failed to write enterprise preferences: {}", e))?;

    Ok(())
}

fn clear_enterprise_project_preference(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "DELETE FROM ItemTable WHERE key = ?",
        ["antigravityUnifiedStateSync.enterprisePreferences"],
    )
    .map_err(|e| format!("Failed to clear enterprise preferences: {}", e))?;

    Ok(())
}

/// 注入 Service Machine ID 到数据库，解决 VS Code 缓存指纹不匹配导致 Token 失效的问题
pub fn write_service_machine_id(
    db_path: &std::path::Path,
    service_machine_id: &str,
) -> Result<(), String> {
    if !db_path.is_file() {
        return Err("Antigravity state database does not exist".to_string());
    }
    let conn = Connection::open_with_flags(db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    conn.execute(
        "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
        ["telemetry.serviceMachineId", service_machine_id],
    )
    .map_err(|e| format!("Failed to write serviceMachineId: {}", e))?;

    crate::modules::logger::log_info(&format!(
        "Successfully injected serviceMachineId: {}",
        service_machine_id
    ));

    Ok(())
}

#[cfg(test)]
mod safety_tests {
    use super::*;

    #[test]
    fn injection_rejects_missing_or_corrupt_database_without_replacing_state() {
        let temp = tempfile::tempdir().unwrap();
        let missing = temp.path().join("missing.vscdb");
        assert!(inject_token(
            &missing,
            "access",
            "refresh",
            1,
            "test@example.com",
            false,
            None,
            None,
            None,
            Some("classic")
        )
        .is_err());
        assert!(!missing.exists());

        let path = temp.path().join("state.vscdb");
        let conn = Connection::open(&path).unwrap();
        conn.execute(
            "CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO ItemTable VALUES (?1, ?2)",
            ["antigravityUnifiedStateSync.oauthToken", "invalid-base64!"],
        )
        .unwrap();
        drop(conn);
        assert!(inject_token(
            &path,
            "access",
            "refresh",
            1,
            "test@example.com",
            false,
            None,
            None,
            None,
            Some("classic")
        )
        .is_err());
        let conn = Connection::open(&path).unwrap();
        let existing: String = conn
            .query_row(
                "SELECT value FROM ItemTable WHERE key = ?1",
                ["antigravityUnifiedStateSync.oauthToken"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(existing, "invalid-base64!");
    }
}
