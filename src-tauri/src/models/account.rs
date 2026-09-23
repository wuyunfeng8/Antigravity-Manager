use super::{quota::QuotaData, token::TokenData};
use serde::{Deserialize, Serialize};

/// 账号数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub token: TokenData,
    /// 可选的设备指纹，用于切换账号时固定机器信息
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_profile: Option<DeviceProfile>,
    /// 设备指纹历史（生成/采集时记录），不含基线
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub device_history: Vec<DeviceProfileVersion>,
    pub quota: Option<QuotaData>,
    /// Disabled accounts are excluded from relay recommendations and background warmup.
    #[serde(default)]
    pub disabled: bool,
    /// Optional human-readable reason for disabling.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disabled_reason: Option<String>,
    /// Unix timestamp when the account was disabled.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disabled_at: Option<i64>,
    /// [NEW] 403 验证阻止状态 (VALIDATION_REQUIRED)
    #[serde(default)]
    pub validation_blocked: bool,
    /// [NEW] 验证阻止截止时间戳
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub validation_blocked_until: Option<i64>,
    /// [NEW] 验证阻止原因
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub validation_blocked_reason: Option<String>,
    /// [NEW] 验证链接 URL (#1522)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub validation_url: Option<String>,
    pub created_at: i64,
    pub last_used: i64,
    /// 用户自定义标签
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_label: Option<String>,
}

impl Account {
    pub fn new(id: String, email: String, token: TokenData) -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            id,
            email,
            name: None,
            token,
            device_profile: None,
            device_history: Vec::new(),
            quota: None,
            disabled: false,
            disabled_reason: None,
            disabled_at: None,
            validation_blocked: false,
            validation_blocked_until: None,
            validation_blocked_reason: None,
            validation_url: None,
            created_at: now,
            last_used: now,
            custom_label: None,
        }
    }

    pub fn update_last_used(&mut self) {
        self.last_used = chrono::Utc::now().timestamp();
    }

    pub fn update_quota(&mut self, mut quota: QuotaData) {
        // A failed/partial summary is not evidence that a previously observed bucket recovered.
        if let Some(existing) = &self.quota {
            if let Some(old_groups) = &existing.quota_groups {
                let groups = quota.quota_groups.get_or_insert_with(Vec::new);
                for old_group in old_groups {
                    let index = groups
                        .iter()
                        .position(|g| g.display_name == old_group.display_name)
                        .unwrap_or_else(|| {
                            groups.push(crate::models::quota::QuotaGroup {
                                buckets: Vec::new(),
                                ..old_group.clone()
                            });
                            groups.len() - 1
                        });
                    for old_bucket in &old_group.buckets {
                        let mut previous = old_bucket.clone();
                        let observed_at = *previous
                            .observed_at
                            .get_or_insert(existing.last_updated.saturating_mul(1000));
                        if let Some(current) = groups[index]
                            .buckets
                            .iter_mut()
                            .find(|b| b.bucket_id == previous.bucket_id)
                        {
                            let current_observed_at = current
                                .observed_at
                                .unwrap_or(quota.last_updated.saturating_mul(1000));
                            if current_observed_at <= observed_at {
                                *current = previous;
                            } else {
                                current.retain_cycle_boundary(&previous, current_observed_at);
                            }
                        } else {
                            groups[index].buckets.push(previous);
                        }
                    }
                }
            }
        }
        if quota.subscription_tier.is_none() {
            if let Some(ref existing) = self.quota {
                quota.subscription_tier = existing.subscription_tier.clone();
            }
        }
        quota.ensure_subscription_tier();
        self.quota = Some(quota);
    }
}

/// Account fields that may cross the Tauri IPC boundary. Credentials stay in Rust.
#[derive(Debug, Clone, Serialize)]
pub struct AccountView {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub device_profile: Option<DeviceProfile>,
    pub device_history: Vec<DeviceProfileVersion>,
    pub quota: Option<QuotaData>,
    pub disabled: bool,
    pub disabled_reason: Option<String>,
    pub disabled_at: Option<i64>,
    pub validation_blocked: bool,
    pub validation_blocked_until: Option<i64>,
    pub validation_blocked_reason: Option<String>,
    pub validation_url: Option<String>,
    pub created_at: i64,
    pub last_used: i64,
    pub custom_label: Option<String>,
}

impl From<Account> for AccountView {
    fn from(account: Account) -> Self {
        Self {
            id: account.id,
            email: account.email,
            name: account.name,
            device_profile: account.device_profile,
            device_history: account.device_history,
            quota: account.quota,
            disabled: account.disabled,
            disabled_reason: account.disabled_reason,
            disabled_at: account.disabled_at,
            validation_blocked: account.validation_blocked,
            validation_blocked_until: account.validation_blocked_until,
            validation_blocked_reason: account.validation_blocked_reason,
            validation_url: account.validation_url,
            created_at: account.created_at,
            last_used: account.last_used,
            custom_label: account.custom_label,
        }
    }
}

#[cfg(test)]
mod ipc_tests {
    use super::*;

    #[test]
    fn account_view_never_serializes_credentials() {
        let token = TokenData::new(
            "access-secret".into(),
            "refresh-secret".into(),
            3600,
            None,
            None,
            None,
            false,
            Some("id-secret".into()),
        );
        let account = Account::new("test-id".into(), "test@example.com".into(), token);
        let value = serde_json::to_value(AccountView::from(account)).unwrap();
        assert!(value.get("token").is_none());
        assert_eq!(value["email"], "test@example.com");
    }
}

/// 账号索引数据（accounts.json）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountIndex {
    pub version: String,
    pub accounts: Vec<AccountSummary>,
    pub current_account_id: Option<String>,
    #[serde(default)]
    pub current_target_ide: Option<String>,
}

/// 账号摘要信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountSummary {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    #[serde(default)]
    pub disabled: bool,
    pub created_at: i64,
    pub last_used: i64,
}

impl AccountIndex {
    pub fn new() -> Self {
        Self {
            version: "2.0".to_string(),
            accounts: Vec::new(),
            current_account_id: None,
            current_target_ide: None,
        }
    }
}

impl Default for AccountIndex {
    fn default() -> Self {
        Self::new()
    }
}

/// 设备指纹（storage.json 中 telemetry 相关字段）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceProfile {
    pub machine_id: String,
    pub mac_machine_id: String,
    pub dev_device_id: String,
    pub sqm_id: String,
}

/// 指纹历史版本
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceProfileVersion {
    pub id: String,
    pub created_at: i64,
    pub label: String,
    pub profile: DeviceProfile,
    #[serde(default)]
    pub is_current: bool,
}

/// 导出账号项（用于备份/迁移）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountExportItem {
    pub email: String,
    pub refresh_token: String,
}

/// 导出账号响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountExportResponse {
    pub accounts: Vec<AccountExportItem>,
}
