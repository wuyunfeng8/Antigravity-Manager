import { Account, DeviceProfile, DeviceProfileVersion, QuotaData } from '../types/account';
import { request as invoke } from '../utils/request';

export async function listAccounts(): Promise<Account[]> {
    const response = await invoke<any>('list_accounts');
    // 如果返回的是对象格式 { accounts: [...] }, 则取其 accounts 属性
    if (response && typeof response === 'object' && Array.isArray(response.accounts)) {
        return response.accounts;
    }
    // 否则直接返回响应内容（假设为数组）
    return response || [];
}

export async function getCurrentAccount(): Promise<Account | null> {
    return await invoke('get_current_account');
}

export async function addAccount(email: string, refreshToken: string): Promise<Account> {
    return await invoke('add_account', { email, refreshToken });
}

export async function deleteAccount(accountId: string): Promise<void> {
    return await invoke('delete_account', { accountId });
}

export async function switchAccount(accountId: string, targetIde?: string): Promise<void> {
    return await invoke('switch_account', { accountId, targetIde });
}

export async function fetchAccountQuota(accountId: string): Promise<QuotaData> {
    return await invoke('fetch_account_quota', { accountId });
}

export interface RefreshStats {
    total: number;
    success: number;
    failed: number;
    details: string[];
}

export async function refreshAllQuotas(): Promise<RefreshStats> {
    return await invoke('refresh_all_quotas');
}

// OAuth
export async function startOAuthLogin(oauthClientKey?: string): Promise<Account> {
    return await invoke('start_oauth_login', oauthClientKey ? { oauthClientKey } : undefined);
}

export async function cancelOAuthLogin(): Promise<void> {
    return await invoke('cancel_oauth_login');
}


// 导入
export async function importV1Accounts(): Promise<Account[]> {
    return await invoke('import_v1_accounts');
}

export interface LocalAccountPreview {
    id: string;
    email: string | null;
    source: 'keyring' | 'ide_database' | 'custom_database';
    available: boolean;
}

export interface LocalImportResult {
    imported: string[];
    failed: { source: string; message: string }[];
}

export async function scanLocalAccounts(customDbPath?: string): Promise<LocalAccountPreview[]> {
    return await invoke('scan_local_accounts', { customDbPath: customDbPath ?? null });
}

export async function importSelectedLocalAccounts(candidateIds: string[]): Promise<LocalImportResult> {
    return await invoke('import_selected_local_accounts', { candidateIds });
}

export async function clearLocalAccountScan(): Promise<void> {
    return await invoke('clear_local_account_scan');
}

export async function syncAccountFromDb(): Promise<Account | null> {
    return await invoke('sync_account_from_db');
}

// 设备指纹相关
export interface DeviceProfilesResponse {
    current_storage?: DeviceProfile;
    history?: DeviceProfileVersion[];
    baseline?: DeviceProfile;
}

export async function getDeviceProfiles(accountId: string): Promise<DeviceProfilesResponse> {
    return await invoke('get_device_profiles', { accountId });
}

export async function restoreOriginalDevice(): Promise<string> {
    return await invoke('restore_original_device');
}



export async function restoreDeviceVersion(accountId: string, versionId: string): Promise<DeviceProfile> {
    return await invoke('restore_device_version', { accountId, versionId });
}

export async function deleteDeviceVersion(accountId: string, versionId: string): Promise<void> {
    return await invoke('delete_device_version', { accountId, versionId });
}

export async function openDeviceFolder(): Promise<void> {
    return await invoke('open_device_folder');
}

export async function previewGenerateProfile(): Promise<DeviceProfile> {
    return await invoke('preview_generate_profile');
}

export async function bindDeviceProfileWithProfile(accountId: string, profile: DeviceProfile): Promise<DeviceProfile> {
    return await invoke('bind_device_profile_with_profile', { accountId, profile });
}

// 预热相关
export async function warmUpAllAccounts(): Promise<string> {
    return await invoke('warm_up_all_accounts');
}

export async function warmUpAccount(accountId: string): Promise<string> {
    return await invoke('warm_up_account', { accountId });
}

// 导出账号相关
export interface ExportAccountItem {
    email: string;
    refresh_token: string;
}

export interface ExportAccountsResponse {
    accounts: ExportAccountItem[];
}

export async function exportAccounts(accountIds: string[]): Promise<ExportAccountsResponse> {
    return await invoke('export_accounts', { accountIds });
}

// 自定义标签相关
export async function updateAccountLabel(accountId: string, label: string): Promise<void> {
    return await invoke('update_account_label', { accountId, label });
}
