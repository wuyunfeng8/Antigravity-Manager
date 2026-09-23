import { useState, useEffect, startTransition } from 'react';
import { Save, Github, User, ExternalLink, RefreshCw, Network, Globe } from 'lucide-react';
import { request as invoke } from '../utils/request';
import { open } from '@tauri-apps/plugin-dialog';
import { useConfigStore } from '../stores/useConfigStore';
import { AppConfig } from '../types/config';
import ModalDialog from '../components/common/ModalDialog';
import { showToast } from '../components/common/ToastContainer';
import SmartWarmup from '../components/settings/SmartWarmup';
import { useDebugConsole } from '../stores/useDebugConsole';

import { useTranslation } from 'react-i18next';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { emit } from '@tauri-apps/api/event';
import DebugConsole from '../components/debug/DebugConsole';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Card, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Label } from '../components/ui/label';



function normalizeDataDirDisplay(path: string): string {
    const trimmed = path.trim();
    if (trimmed.startsWith('\\\\?\\UNC\\')) {
        return `\\\\${trimmed.slice('\\\\?\\UNC\\'.length)}`;
    }
    if (trimmed.startsWith('\\\\?\\')) {
        return trimmed.slice('\\\\?\\'.length);
    }
    if (trimmed.startsWith('//?/UNC/')) {
        return `//${trimmed.slice('//?/UNC/'.length)}`;
    }
    if (trimmed.startsWith('//?/')) {
        return trimmed.slice('//?/'.length);
    }
    return trimmed;
}

function Settings() {
    const { t, i18n } = useTranslation();
    const { config, loadConfig, saveConfig, updateLanguage, updateTheme } = useConfigStore();
    const { enable, disable, isEnabled } = useDebugConsole();
    const [activeTab, setActiveTab] = useState<'general' | 'account' | 'maintenance' | 'about'>('general');
    const [appVersion, setAppVersion] = useState<string>('4.7.12');
    const [formData, setFormData] = useState<AppConfig>({
        language: 'zh',
        theme: 'system',
        auto_refresh: false,
        refresh_interval: 15,
        auto_sync: false,
        sync_interval: 5,
        network_proxy: {
            enabled: false,
            url: ''
        },
        scheduled_warmup: {
            enabled: false,
            monitored_models: []
        },
    });

    // Dialog state
    const [dataDirPath, setDataDirPath] = useState<string>('~/.antigravity_tools/');
    const [pendingDataDir, setPendingDataDir] = useState<string>('');
    const [isMigrateDataDirOpen, setIsMigrateDataDirOpen] = useState(false);
    const [isMigratingDataDir, setIsMigratingDataDir] = useState(false);

    // Antigravity cache clearing state
    const [isClearCacheOpen, setIsClearCacheOpen] = useState(false);
    const [cachePaths, setCachePaths] = useState<string[]>([]);
    const [isClearingCache, setIsClearingCache] = useState(false);

    // Update check state
    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
    const [updateInfo, setUpdateInfo] = useState<{
        hasUpdate: boolean;
        latestVersion: string;
        currentVersion: string;
        downloadUrl: string;
        source?: string;
    } | null>(null);

    // Homebrew Cask state
    const [isBrewInstalled, setIsBrewInstalled] = useState(false);
    const [isBrewUpgrading, setIsBrewUpgrading] = useState(false);
    const [isBrewConfirmOpen, setIsBrewConfirmOpen] = useState(false);
    const [isBrewSuccessOpen, setIsBrewSuccessOpen] = useState(false);
    const [isUpdateConfirmOpen, setIsUpdateConfirmOpen] = useState(false);


    useEffect(() => {
        loadConfig();

        // 获取真实数据目录路径
        invoke<string>('get_data_dir_path')
            .then(path => setDataDirPath(normalizeDataDirDisplay(path)))
            .catch(err => console.error('Failed to get data dir:', err));

        // 加载更新设置
        invoke<{ auto_check: boolean; last_check_time: number; check_interval_hours: number }>('get_update_settings')
            .then(settings => {
                setFormData(prev => ({
                    ...prev,
                    auto_check_update: settings.auto_check,
                    update_check_interval: settings.check_interval_hours
                }));
            })
            .catch(err => console.error('Failed to load update settings:', err));

        // 获取真实的开机自启状态
        invoke<boolean>('is_auto_launch_enabled')
            .then(enabled => {
                setFormData(prev => ({ ...prev, auto_launch: enabled }));
            })
            .catch(err => console.error('Failed to get auto launch status:', err));

        getVersion().then(v => setAppVersion(v)).catch(() => {});

        invoke<boolean>('check_homebrew_installation')
            .then(installed => setIsBrewInstalled(installed))
            .catch(err => console.error('Failed to check Homebrew installation:', err));

    }, [loadConfig]);

    useEffect(() => {
        if (config) {
            setFormData(config);
        }
    }, [config]);

    // 删除自动启用调试控制台的逻辑 - 改为用户手动控制

    const handleSave = async () => {
        try {
            // 校验：如果启用了上游代理但没有填写地址，给出提示
            const proxyEnabled = formData.network_proxy?.enabled;
            const proxyUrl = formData.network_proxy?.url?.trim();
            if (proxyEnabled && !proxyUrl) {
                showToast(t('settings.network_proxy.validation_error'), 'error');
                return;
            }

            await saveConfig(formData);
            showToast(t('common.saved'), 'success');

            // 如果修改了代理配置，提示用户需要重启
            if (proxyEnabled && proxyUrl) {
                showToast(t('settings.network_proxy.restart_hint'), 'info');
            }
        } catch (error) {
            showToast(`${t('common.error')}: ${error}`, 'error');
        }
    };



    const handleOpenDataDir = async () => {
        try {
            await invoke('open_data_folder');
        } catch (error) {
            showToast(`${t('common.error')}: ${error}`, 'error');
        }
    };

    const handleSelectDataDir = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: t('settings.advanced.data_dir_select'),
            });
            if (!selected || typeof selected !== 'string') {
                return;
            }
            if (selected === dataDirPath) {
                return;
            }
            setPendingDataDir(selected);
            setIsMigrateDataDirOpen(true);
        } catch (error) {
            showToast(`${t('common.error')}: ${error}`, 'error');
        }
    };

    const confirmMigrateDataDir = async () => {
        if (!pendingDataDir || isMigratingDataDir) {
            return;
        }
        setIsMigratingDataDir(true);
        try {
            const newPath = await invoke<string>('set_data_dir', { path: pendingDataDir });
            setDataDirPath(normalizeDataDirDisplay(newPath));
            setIsMigrateDataDirOpen(false);
            setPendingDataDir('');
            showToast(t('settings.advanced.data_dir_migrated'), 'success');
            showToast(t('settings.advanced.data_dir_restart_hint'), 'info');
        } catch (error) {
            showToast(`${t('common.error')}: ${error}`, 'error');
        } finally {
            setIsMigratingDataDir(false);
        }
    };

    const handleSelectExportPath = async () => {
        try {
            // @ts-ignore
            const selected = await open({
                directory: true,
                multiple: false,
                title: t('settings.advanced.export_path'),
            });
            if (selected && typeof selected === 'string') {
                setFormData({ ...formData, default_export_path: selected });
            }
        } catch (error) {
            showToast(`${t('common.error')}: ${error}`, 'error');
        }
    };

    const handleSelectAntigravityPath = async () => {
        try {
            const selected = await open({
                directory: false,
                multiple: false,
                title: t('settings.advanced.antigravity_path_select'),
            });
            if (selected && typeof selected === 'string') {
                setFormData({ ...formData, antigravity_executable: selected });
            }
        } catch (error) {
            showToast(`${t('common.error')}: ${error}`, 'error');
        }
    };

    const handleSelectAntigravityIdePath = async () => {
        try {
            const selected = await open({
                directory: false,
                multiple: false,
                title: t('settings.advanced.antigravity_ide_path_select', 'Select Antigravity IDE Executable'),
            });
            if (selected && typeof selected === 'string') {
                setFormData({ ...formData, antigravity_ide_executable: selected });
            }
        } catch (error) {
            showToast(`${t('common.error')}: ${error}`, 'error');
        }
    };

    const handleDetectAntigravityPath = async () => {
        try {
            const path = await invoke<string>('get_antigravity_path', { bypassConfig: true });
            setFormData({ ...formData, antigravity_executable: path });
            showToast(t('settings.advanced.antigravity_path_detected'), 'success');
        } catch (error) {
            showToast(`${t('common.error')}: ${error}`, 'error');
        }
    };

    const handleSelectAntigravityCliPath = async () => {
        try {
            const selected = await open({
                directory: false,
                multiple: false,
                title: t('settings.advanced.antigravity_cli_path_select', 'Select Antigravity CLI (agy) Executable'),
            });
            if (selected && typeof selected === 'string') {
                setFormData({ ...formData, antigravity_cli_executable: selected });
            }
        } catch (error) {
            showToast(`${t('common.error')}: ${error}`, 'error');
        }
    };

    const handleDetectAntigravityCliPath = async () => {
        try {
            const path = await invoke<string>('get_antigravity_cli_path', { bypassConfig: true });
            setFormData({ ...formData, antigravity_cli_executable: path });
            showToast(t('settings.advanced.antigravity_cli_path_detected', 'Detected CLI path updated'), 'success');
        } catch (error) {
            showToast(`${t('common.error')}: ${error}`, 'error');
        }
    };

    const handleCheckUpdate = async () => {
        setIsCheckingUpdate(true);
        setUpdateInfo(null);
        try {
            const result = await invoke<{
                has_update: boolean;
                latest_version: string;
                current_version: string;
                download_url: string;
                source?: string;
            }>('check_for_updates');

            setUpdateInfo({
                hasUpdate: result.has_update,
                latestVersion: result.latest_version,
                currentVersion: result.current_version,
                downloadUrl: result.download_url,
                source: result.source,
            });

            if (result.has_update) {
                const sourceMsg = result.source && result.source !== 'GitHub API' ? ` (via ${result.source})` : '';
                showToast(t('settings.about.new_version_available', { version: result.latest_version }) + sourceMsg, 'info');
                setIsUpdateConfirmOpen(true);
            } else {
                showToast(t('settings.about.latest_version'), 'success');
            }
        } catch (error) {
            showToast(`${t('settings.about.update_check_failed')}: ${error}`, 'error');
        } finally {
            setIsCheckingUpdate(false);
        }
    };

    const handleConfirmUpdate = async () => {
        setIsUpdateConfirmOpen(false);
        if (isBrewInstalled) {
            handleBrewUpgrade();
            return;
        }
        try {
            await emit('app://trigger-update');
        } catch (err) {
            console.error('Failed to trigger update event:', err);
            if (updateInfo?.downloadUrl) {
                window.open(updateInfo.downloadUrl, '_blank', 'noopener,noreferrer');
            }
        }
    };

    const handleBrewUpgrade = async () => {
        setIsBrewConfirmOpen(false);
        setIsBrewUpgrading(true);
        try {
            await invoke<string>('brew_upgrade_cask');
            setUpdateInfo(null);
            setIsBrewSuccessOpen(true);
        } catch (error) {
            const errKey = String(error);
            const errMsg = t(`settings.about.brew_error_${errKey}`, t('settings.about.brew_upgrade_failed'));
            showToast(errMsg, 'error');
        } finally {
            setIsBrewUpgrading(false);
        }
    };

    // Handle opening cache clear dialog
    const handleOpenClearCacheDialog = async () => {
        try {
            const paths = await invoke<string[]>('get_antigravity_cache_paths');
            setCachePaths(paths);
            setIsClearCacheOpen(true);
        } catch (error) {
            // If no cache paths found, still allow opening the dialog
            setCachePaths([]);
            setIsClearCacheOpen(true);
        }
    };

    // Handle clearing Antigravity cache
    const confirmClearAntigravityCache = async () => {
        setIsClearingCache(true);
        try {
            const result = await invoke<{
                cleared_paths: string[];
                total_size_freed: number;
                errors: string[];
            }>('clear_antigravity_cache');

            const sizeMB = (result.total_size_freed / 1024 / 1024).toFixed(2);

            if (result.cleared_paths.length > 0) {
                showToast(t('settings.advanced.cache_cleared_success', { size: sizeMB }), 'success');
            } else if (result.errors.length > 0) {
                showToast(`${t('common.error')}: ${result.errors[0]}`, 'error');
            } else {
                showToast(t('settings.advanced.cache_not_found'), 'info');
            }
        } catch (error) {
            showToast(`${t('common.error')}: ${error}`, 'error');
        } finally {
            setIsClearingCache(false);
            setIsClearCacheOpen(false);
        }
    };

    return (
        <div className="h-full w-full overflow-y-auto px-5 pb-6 pt-10 sm:px-7">
            <div className="mx-auto max-w-6xl space-y-5">
                <header className="flex items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">设置</h1>
                        <p className="mt-1 text-xs text-muted-foreground">日常选项优先，低频维护工具统一收纳</p>
                    </div>
                    {activeTab !== 'about' && (
                        <Button className="h-10 rounded-xl px-5 text-xs font-semibold" onClick={handleSave}>
                            <Save className="mr-2 h-4 w-4" />
                            {t('settings.save')}
                        </Button>
                    )}
                </header>

                <div className="grid gap-5 md:grid-cols-[180px_1fr]">
                    <Card className="h-fit rounded-2xl p-2">
                        <nav className="space-y-1">
                            {([
                                ['general', t('settings.tabs.general')],
                                ['account', t('settings.tabs.account')],
                                ['maintenance', t('settings.tabs.maintenance', { defaultValue: '维护工具' })],
                                ['about', t('settings.tabs.about')],
                            ] as const).map(([tab, label]) => (
                                <Button
                                    key={tab}
                                    variant={activeTab === tab ? "secondary" : "ghost"}
                                    className="h-10 w-full justify-start rounded-xl px-3 text-xs font-semibold"
                                    onClick={() => startTransition(() => setActiveTab(tab))}
                                >
                                    {label}
                                </Button>
                            ))}
                        </nav>
                    </Card>

                <Card className="rounded-2xl">
                    <CardContent className="p-6">
                    {/* 通用设置 */}
                    {activeTab === 'general' && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-semibold text-foreground">{t('settings.general.title')}</h2>

                            {/* 语言选择 */}
                            <div>
                                <Label className="block text-sm font-medium text-foreground mb-2">{t('settings.general.language')}</Label>
                                <Select
                                    value={formData.language}
                                    onValueChange={(newLang) => {
                                        setFormData({ ...formData, language: newLang });
                                        document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
                                        startTransition(() => {
                                            i18n.changeLanguage(newLang);
                                        });
                                        updateLanguage(newLang);
                                    }}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="zh">简体中文</SelectItem>
                                        <SelectItem value="zh-TW">繁體中文</SelectItem>
                                        <SelectItem value="en">English</SelectItem>
                                        <SelectItem value="ja">日本語</SelectItem>
                                        <SelectItem value="tr">Türkçe</SelectItem>
                                        <SelectItem value="vi">Tiếng Việt</SelectItem>
                                        <SelectItem value="pt">Português</SelectItem>
                                        <SelectItem value="ko">한국어</SelectItem>
                                        <SelectItem value="ru">Русский</SelectItem>
                                        <SelectItem value="ar">العربية</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* 主题选择 */}
                            <div>
                                <Label className="block text-sm font-medium text-foreground mb-2">{t('settings.general.theme')}</Label>
                                <Select
                                    value={formData.theme}
                                    onValueChange={(newTheme) => {
                                        setFormData({ ...formData, theme: newTheme });
                                        updateTheme(newTheme);
                                    }}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="light">{t('settings.general.theme_light')}</SelectItem>
                                        <SelectItem value="dark">{t('settings.general.theme_dark')}</SelectItem>
                                        <SelectItem value="system">{t('settings.general.theme_system')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* 开机自动启动 */}
                            <div>
                                <Label className="mb-2 block text-sm font-medium text-foreground">{t('settings.general.auto_launch')}</Label>
                                <Select
                                    value={formData.auto_launch ? 'enabled' : 'disabled'}
                                    onValueChange={async (value) => {
                                        const enabled = value === 'enabled';
                                        try {
                                            await invoke('toggle_auto_launch', { enable: enabled });
                                            setFormData({ ...formData, auto_launch: enabled });
                                            showToast(enabled ? t('settings.general.auto_launch_enabled') : t('settings.general.auto_launch_disabled'), 'success');
                                        } catch (error) {
                                            showToast(`${t('common.error')}: ${error}`, 'error');
                                        }
                                    }}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="disabled">{t('settings.general.auto_launch_disabled')}</SelectItem>
                                        <SelectItem value="enabled">{t('settings.general.auto_launch_enabled')}</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground mt-2">{t('settings.general.auto_launch_desc')}</p>
                            </div>

                            {/* 自动检查更新 */}
                            <>
                                <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border border-border">
                                    <div>
                                        <div className="font-medium text-foreground">{t('settings.general.auto_check_update')}</div>
                                        <p className="text-xs text-muted-foreground mt-1">{t('settings.general.auto_check_update_desc')}</p>
                                    </div>
                                    <Switch
                                        checked={formData.auto_check_update ?? true}
                                        onCheckedChange={async (enabled) => {
                                            try {
                                                await invoke('save_update_settings', {
                                                    settings: {
                                                        auto_check: enabled,
                                                        last_check_time: 0,
                                                        check_interval_hours: formData.update_check_interval ?? 24
                                                    }
                                                });
                                                setFormData({ ...formData, auto_check_update: enabled });
                                                showToast(enabled ? t('settings.general.auto_check_update_enabled') : t('settings.general.auto_check_update_disabled'), 'success');
                                            } catch (error) {
                                                showToast(`${t('common.error')}: ${error}`, 'error');
                                            }
                                        }}
                                    />
                                </div>

                                {/* 检查间隔 */}
                                {formData.auto_check_update && (
                                    <div className="ml-4 space-y-1.5">
                                        <Label className="block text-sm font-medium text-foreground">{t('settings.general.update_check_interval')}</Label>
                                        <Input
                                            type="number"
                                            className="w-32 h-9 text-sm"
                                            min="1"
                                            max="168"
                                            value={formData.update_check_interval ?? 24}
                                            onChange={(e) => setFormData({ ...formData, update_check_interval: parseInt(e.target.value) })}
                                            onBlur={async () => {
                                                try {
                                                    await invoke('save_update_settings', {
                                                        settings: {
                                                            auto_check: formData.auto_check_update ?? true,
                                                            last_check_time: 0,
                                                            check_interval_hours: formData.update_check_interval ?? 24
                                                        }
                                                    });
                                                    showToast(t('settings.general.update_check_interval_saved'), 'success');
                                                } catch (error) {
                                                    showToast(`${t('common.error')}: ${error}`, 'error');
                                                }
                                            }}
                                        />
                                        <p className="text-xs text-muted-foreground">{t('settings.general.update_check_interval_desc')}</p>
                                    </div>
                                )}
                            </>
                        </div>
                    )}

                    {/* 账号设置 */}
                    {activeTab === 'account' && (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            {/* 自动刷新配额 */}
                            <div className="group bg-card rounded-xl p-5 border border-border hover:border-primary/40 transition-all duration-300 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                                            <RefreshCw size={20} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-foreground">{t('settings.account.auto_refresh')}</div>
                                            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.account.auto_refresh_desc')}</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={formData.auto_refresh}
                                        onCheckedChange={async (enabled) => {
                                            const newConfig = { ...formData, auto_refresh: enabled };
                                            setFormData(newConfig);
                                            try {
                                                await saveConfig(newConfig);
                                            } catch (error) {
                                                showToast(`${t('common.error')}: ${error}`, 'error');
                                            }
                                        }}
                                    />
                                </div>

                                <div className="mt-5 pt-5 border-t border-border flex items-center gap-4 animate-in slide-in-from-top-1 duration-200">
                                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('settings.account.refresh_interval')}</Label>
                                    <Input
                                        type="number"
                                        className="w-24 h-8 text-xs font-bold text-primary"
                                        min="1"
                                        max="35791"
                                        value={formData.refresh_interval}
                                        onChange={(e) => setFormData({ ...formData, refresh_interval: isNaN(parseInt(e.target.value)) ? 1 : Math.min(Math.max(parseInt(e.target.value), 1), 35791) })}
                                    />
                                </div>
                            </div>

                            {/* 自动获取当前账号 */}
                            <div className="group bg-card rounded-xl p-5 border border-border hover:border-emerald-500/40 transition-all duration-300 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
                                            <User size={20} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-foreground">{t('settings.account.auto_sync')}</div>
                                            <p className="text-xs text-muted-foreground mt-0.5">{t('settings.account.auto_sync_desc')}</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={formData.auto_sync}
                                        onCheckedChange={(enabled) => setFormData({ ...formData, auto_sync: enabled })}
                                    />
                                </div>

                                {formData.auto_sync && (
                                    <div className="mt-5 pt-5 border-t border-border flex items-center gap-4 animate-in slide-in-from-top-1 duration-200">
                                        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('settings.account.sync_interval')}</Label>
                                        <Input
                                            type="number"
                                            className="w-24 h-8 text-xs font-bold text-emerald-600 dark:text-emerald-400"
                                            min="1"
                                            max="35791"
                                            value={formData.sync_interval}
                                            onChange={(e) => setFormData({ ...formData, sync_interval: isNaN(parseInt(e.target.value)) ? 1 : Math.min(Math.max(parseInt(e.target.value), 1), 35791) })}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* 7天周配额智能预热 (Smart Warmup) */}
                            <div className="group bg-card rounded-xl p-5 border border-border hover:border-amber-500/40 transition-all duration-300 shadow-sm">
                                <SmartWarmup
                                    config={formData.scheduled_warmup}
                                    onChange={async (newConfig) => {
                                        const newFormData = {
                                            ...formData,
                                            scheduled_warmup: newConfig
                                        };
                                        setFormData(newFormData);
                                        // Hot Save
                                        try {
                                            await saveConfig(newFormData);
                                        } catch (error) {
                                            showToast(`${t('common.error')}: ${error}`, 'error');
                                        }
                                    }}
                                />
                            </div>

                        </div>
                    )}

                    {/* 高级设置 */}
                    {activeTab === 'maintenance' && (
                        <>
                            <div className="space-y-4">
                                {/* 默认导出路径 */}
                                <div>
                                    <Label className="block text-sm font-medium text-foreground mb-1">{t('settings.advanced.export_path')}</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="text"
                                            className="flex-1 font-mono text-xs"
                                            value={formData.default_export_path || t('settings.advanced.export_path_placeholder')}
                                            readOnly
                                        />
                                        {formData.default_export_path && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-destructive hover:bg-destructive/10"
                                                onClick={() => setFormData({ ...formData, default_export_path: undefined })}
                                            >
                                                {t('common.clear')}
                                            </Button>
                                        )}
                                        <Button variant="outline" size="sm" onClick={handleSelectExportPath}>
                                            {t('settings.advanced.select_btn')}
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">{t('settings.advanced.default_export_path_desc')}</p>
                                </div>

                                {/* 数据目录 */}
                                <div>
                                    <Label className="block text-sm font-medium text-foreground mb-1">{t('settings.advanced.data_dir')}</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="text"
                                            className="flex-1 font-mono text-xs bg-muted/40"
                                            value={dataDirPath}
                                            readOnly
                                        />
                                        <Button variant="outline" size="sm" onClick={handleSelectDataDir} disabled={isMigratingDataDir}>
                                            {t('settings.advanced.select_btn')}
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={handleOpenDataDir}>
                                            {t('settings.advanced.open_btn')}
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">{t('settings.advanced.data_dir_desc')}</p>
                                </div>

                                {/* 反重力程序路径 */}
                                <div>
                                    <Label className="block text-sm font-medium text-foreground mb-1">
                                        {t('settings.advanced.antigravity_path')}
                                    </Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="text"
                                            className="flex-1 font-mono text-xs"
                                            value={formData.antigravity_executable || ''}
                                            placeholder={t('settings.advanced.antigravity_path_placeholder')}
                                            onChange={(e) => setFormData({ ...formData, antigravity_executable: e.target.value })}
                                        />
                                        {formData.antigravity_executable && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-destructive hover:bg-destructive/10"
                                                onClick={() => setFormData({ ...formData, antigravity_executable: undefined })}
                                            >
                                                {t('common.clear')}
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleDetectAntigravityPath}
                                        >
                                            {t('settings.advanced.detect_btn')}
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={handleSelectAntigravityPath}>
                                            {t('settings.advanced.select_btn')}
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        {t('settings.advanced.antigravity_path_desc')}
                                    </p>
                                </div>

                                {/* Antigravity CLI (agy) 程序路径 */}
                                <div>
                                    <Label className="block text-sm font-medium text-foreground mb-1">
                                        {t('settings.advanced.antigravity_cli_path', 'Antigravity CLI (agy) Path')}
                                    </Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="text"
                                            className="flex-1 font-mono text-xs"
                                            value={formData.antigravity_cli_executable || ''}
                                            placeholder={t('settings.advanced.antigravity_cli_path_placeholder', '未设置 (将使用自动探测)')}
                                            onChange={(e) => setFormData({ ...formData, antigravity_cli_executable: e.target.value })}
                                        />
                                        {formData.antigravity_cli_executable && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-destructive hover:bg-destructive/10"
                                                onClick={() => setFormData({ ...formData, antigravity_cli_executable: undefined })}
                                            >
                                                {t('common.clear')}
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleDetectAntigravityCliPath}
                                        >
                                            {t('settings.advanced.detect_btn')}
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={handleSelectAntigravityCliPath}>
                                            {t('settings.advanced.select_btn')}
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        {t('settings.advanced.antigravity_cli_path_desc', '设置 Antigravity CLI (agy) 可执行文件路径，用于账号切换。')}
                                    </p>
                                </div>

                                {/* Antigravity IDE 程序路径 */}
                                <div>
                                    <Label className="block text-sm font-medium text-foreground mb-1">
                                        {t('settings.advanced.antigravity_ide_path', 'Antigravity IDE Path')}
                                    </Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="text"
                                            className="flex-1 font-mono text-xs"
                                            value={formData.antigravity_ide_executable || ''}
                                            placeholder={t('settings.advanced.antigravity_ide_path_placeholder', 'D:\\Antigravity\\Antigravity.exe')}
                                            onChange={(e) => setFormData({ ...formData, antigravity_ide_executable: e.target.value })}
                                        />
                                        {formData.antigravity_ide_executable && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-destructive hover:bg-destructive/10"
                                                onClick={() => setFormData({ ...formData, antigravity_ide_executable: undefined })}
                                            >
                                                {t('common.clear')}
                                            </Button>
                                        )}
                                        <Button variant="outline" size="sm" onClick={handleSelectAntigravityIdePath}>
                                            {t('settings.advanced.select_btn')}
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        {t('settings.advanced.antigravity_ide_path_desc', 'Specify the executable path for Antigravity IDE (code editor). Once set, account switching will strictly protect processes at this path from being terminated.')}
                                    </p>
                                </div>

                                {/* 反重力程序启动参数 */}
                                <div>
                                    <Label className="block text-sm font-medium text-foreground mb-1">
                                        {t('settings.advanced.antigravity_args')}
                                    </Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="text"
                                            className="flex-1 font-mono text-xs"
                                            value={formData.antigravity_args ? formData.antigravity_args.join(' ') : ''}
                                            placeholder={t('settings.advanced.antigravity_args_placeholder')}
                                            onChange={(e) => {
                                                const args = e.target.value.trim() === '' ? [] : e.target.value.split(' ').map(arg => arg.trim()).filter(arg => arg !== '');
                                                setFormData({ ...formData, antigravity_args: args });
                                            }}
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={async () => {
                                                try {
                                                    const args = await invoke<string[]>('get_antigravity_args');
                                                    setFormData({ ...formData, antigravity_args: args });
                                                    showToast(t('settings.advanced.antigravity_args_detected'), 'success');
                                                } catch (error) {
                                                    showToast(`${t('settings.advanced.antigravity_args_detect_error')}: ${error}`, 'error');
                                                }
                                            }}
                                        >
                                            {t('settings.advanced.detect_args_btn')}
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        {t('settings.advanced.antigravity_args_desc')}
                                    </p>
                                </div>

                                {/* Antigravity 缓存清理 */}
                                <div className="border-t border-border pt-4">
                                    <h3 className="font-medium text-foreground mb-3">{t('settings.advanced.antigravity_cache_title')}</h3>
                                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-xl p-3 mb-3">
                                        <p className="text-xs text-amber-700 dark:text-amber-400">{t('settings.advanced.antigravity_cache_warning')}</p>
                                    </div>
                                    <div className="bg-muted/40 border border-border rounded-xl p-3 mb-3">
                                        <p className="text-xs text-muted-foreground">{t('settings.advanced.antigravity_cache_desc')}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                                            onClick={handleOpenClearCacheDialog}
                                        >
                                            {t('settings.advanced.clear_antigravity_cache')}
                                        </Button>
                                    </div>
                                </div>

                                {/* 全局上游代理设置 */}
                                <div className="group bg-card rounded-xl p-5 border border-border hover:border-primary/40 transition-all duration-300 shadow-sm relative overflow-hidden">
                                    <div className="flex items-center justify-between mb-5 relative z-10">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 shadow-sm">
                                                <Globe size={18} />
                                            </div>
                                            <div>
                                                <div className="font-bold text-foreground text-sm">{t('settings.network_proxy.title')}</div>
                                                <p className="text-xs text-muted-foreground mt-0.5 leading-tight max-w-[280px]">
                                                    {t('settings.network_proxy.desc_short')}
                                                </p>
                                            </div>
                                        </div>
                                        <Switch
                                            checked={formData.network_proxy?.enabled ?? false}
                                            onCheckedChange={(checked) => setFormData({
                                                ...formData,
                                                network_proxy: {
                                                    ...formData.network_proxy,
                                                    enabled: checked
                                                }
                                            })}
                                        />
                                    </div>

                                    {formData.network_proxy?.enabled && (
                                        <div className="space-y-4 animate-in slide-in-from-top-2 duration-300 relative z-10">
                                            <div className="pt-4 border-t border-border">
                                                <Label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2.5">
                                                    {t('settings.network_proxy.url')}
                                                </Label>
                                                <Input
                                                    type="text"
                                                    placeholder={t('settings.network_proxy.url_placeholder')}
                                                    value={formData.network_proxy?.url || ''}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        network_proxy: {
                                                            ...formData.network_proxy,
                                                            url: e.target.value
                                                        }
                                                    })}
                                                />
                                                <div className="mt-4 bg-amber-500/10 rounded-xl p-3.5 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-3">
                                                    <div className="mt-0.5 p-1 bg-amber-500/20 rounded-lg shrink-0">
                                                        <Network size={12} className="text-amber-600 dark:text-amber-400" />
                                                    </div>
                                                    <div className="leading-relaxed">
                                                        <span className="font-bold mr-1.5 opacity-80 uppercase tracking-tighter">Tip:</span>
                                                        {t('settings.network_proxy.socks5h_hint')}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>
                        </>
                    )}


                    {/* 调试设置 */}
                    {activeTab === 'maintenance' && (
                        <div className="mt-8 space-y-4 border-t pt-6 animate-in fade-in duration-500">
                            {/* 标题和开关 */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">
                                        {t('settings.debug.title')}
                                    </h2>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {t('settings.debug.desc')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Switch
                                        checked={isEnabled}
                                        onCheckedChange={(checked) => checked ? enable() : disable()}
                                    />
                                    <span className="text-sm font-medium text-foreground">
                                        {isEnabled ? t('settings.debug.enabled') : t('settings.debug.disabled')}
                                    </span>
                                </div>
                            </div>

                            {/* 控制台或提示 */}
                            {isEnabled ? (
                                <div className="h-[calc(100vh-320px)] min-h-[400px]">
                                    <DebugConsole embedded />
                                </div>
                            ) : (
                                <div className="h-[calc(100vh-320px)] min-h-[400px] flex items-center justify-center bg-muted/20 rounded-xl border border-border">
                                    <div className="text-center">
                                        <p className="text-muted-foreground text-base font-medium">
                                            {t('settings.debug.disabled_hint')}
                                        </p>
                                        <p className="text-muted-foreground/70 text-xs mt-2">
                                            {t('settings.debug.disabled_desc')}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}



                    {activeTab === 'about' && (
                        <div className="flex flex-col h-full animate-in fade-in duration-500">
                            <div className="flex-1 flex flex-col justify-center items-center space-y-8">
                                {/* Branding Section */}
                                <div className="text-center space-y-4">
                                    <div className="relative inline-block group">
                                        <div className="absolute inset-0 bg-primary/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
                                        <img
                                            src="/icon.png"
                                            alt="AMT Logo"
                                            className="relative w-24 h-24 rounded-3xl shadow-2xl transform group-hover:scale-105 transition-all duration-500 rotate-3 group-hover:rotate-6 object-cover bg-background"
                                        />
                                    </div>

                                    <div>
                                        <h3 className="text-3xl font-black text-foreground tracking-tight mb-2">{t('common.app_name', 'AMT')}</h3>
                                        <div className="flex items-center justify-center gap-2 text-sm">
                                            v{appVersion}
                                            <span className="text-muted-foreground">•</span>
                                            <span className="text-muted-foreground">{t('settings.about.subtitle', { defaultValue: 'Antigravity 账号接力管理器' })}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Links */}
                                <div className="flex items-center justify-center gap-4">
                                    <Button
                                        variant="outline"
                                        asChild
                                        className="gap-2"
                                    >
                                        <a
                                            href="https://github.com/wuyunfeng8/Antigravity-Manager"
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            <Github className="w-4 h-4" />
                                            <span>GitHub</span>
                                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                                        </a>
                                    </Button>
                                </div>

                                {/* Check for Updates */}
                                <div className="flex flex-col items-center gap-3">
                                    <Button
                                        onClick={handleCheckUpdate}
                                        disabled={isCheckingUpdate}
                                        className="gap-2"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                                        {isCheckingUpdate ? t('settings.about.checking_update') : t('settings.about.check_update')}
                                    </Button>

                                    {/* Update Status */}
                                    {updateInfo && !isCheckingUpdate && (
                                        <div className="text-center">
                                            {updateInfo.hasUpdate ? (
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                                                        {t('settings.about.new_version_available', { version: updateInfo.latestVersion })}
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-wrap justify-center">
                                                        {isBrewInstalled ? (
                                                            <Button
                                                                onClick={() => setIsBrewConfirmOpen(true)}
                                                                disabled={isBrewUpgrading}
                                                                variant="default"
                                                                size="sm"
                                                                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                                                            >
                                                                {isBrewUpgrading ? (
                                                                    <>
                                                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                                        {t('settings.about.brew_upgrading')}
                                                                    </>
                                                                ) : (
                                                                    t('settings.about.brew_upgrade')
                                                                )}
                                                            </Button>
                                                        ) : (
                                                            <Button onClick={handleConfirmUpdate} size="sm" className="gap-1.5">
                                                                <RefreshCw className="w-3.5 h-3.5" />
                                                                {t('settings.about.upgrade_now_btn', { defaultValue: '立即自动更新' })}
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            asChild
                                                            className="gap-1.5"
                                                        >
                                                            <a
                                                                href={updateInfo.downloadUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                            >
                                                                {t('settings.about.download_update')}
                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                            </a>
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                                                    ✓ {t('settings.about.latest_version')}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="text-center text-[10px] text-muted-foreground mt-auto pb-2">
                                {t('settings.about.copyright')}
                            </div>
                        </div>
                    )
                    }
                    </CardContent>
                </Card>
                </div>



                <ModalDialog
                    isOpen={isMigrateDataDirOpen}
                    title={t('settings.advanced.data_dir_migrate_title')}
                    type="confirm"
                    confirmText={isMigratingDataDir ? t('common.loading') : t('common.confirm')}
                    cancelText={t('common.cancel')}
                    onConfirm={confirmMigrateDataDir}
                    onCancel={() => {
                        if (!isMigratingDataDir) {
                            setIsMigrateDataDirOpen(false);
                            setPendingDataDir('');
                        }
                    }}
                >
                    <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
                        {t('settings.advanced.data_dir_migrate_msg', { path: pendingDataDir })}
                    </p>
                </ModalDialog>

                {/* Antigravity Cache Clear Modal */}
                <ModalDialog
                    isOpen={isClearCacheOpen}
                    title={t('settings.advanced.clear_cache_confirm_title')}
                    type="confirm"
                    confirmText={isClearingCache ? t('common.clearing') : t('common.clear')}
                    cancelText={t('common.cancel')}
                    isDestructive={true}
                    onConfirm={confirmClearAntigravityCache}
                    onCancel={() => setIsClearCacheOpen(false)}
                >
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            {t('settings.advanced.clear_cache_confirm_msg')}
                        </p>
                        {cachePaths.length > 0 ? (
                            <div className="bg-muted/40 rounded-lg p-3 max-h-40 overflow-y-auto border border-border">
                                <ul className="text-xs font-mono text-muted-foreground space-y-1">
                                    {cachePaths.map((path, index) => (
                                        <li key={index} className="truncate">• {path}</li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <div className="bg-muted/40 rounded-lg p-3 border border-border">
                                <p className="text-xs text-muted-foreground">
                                    {t('settings.advanced.cache_not_found')}
                                </p>
                            </div>
                        )}
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-lg p-2">
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                {t('settings.advanced.antigravity_cache_warning')}
                            </p>
                        </div>
                    </div>
                </ModalDialog>

                {/* Homebrew Upgrade Confirm Modal */}
                <ModalDialog
                    isOpen={isBrewConfirmOpen}
                    title={t('settings.about.brew_confirm_title')}
                    type="confirm"
                    confirmText={t('settings.about.brew_confirm_btn')}
                    cancelText={t('common.cancel')}
                    onConfirm={handleBrewUpgrade}
                    onCancel={() => setIsBrewConfirmOpen(false)}
                >
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            {t('settings.about.brew_confirm_desc')}
                        </p>
                        <div className="bg-muted/40 rounded-lg p-3 border border-border">
                            <div className="flex items-center justify-between gap-2">
                                <code className="text-xs text-foreground break-all">brew upgrade --cask antigravity-tools</code>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 h-7 text-xs"
                                    onClick={() => {
                                        navigator.clipboard.writeText('brew upgrade --cask antigravity-tools');
                                        showToast(t('common.copied', 'Copied'), 'success');
                                    }}
                                >
                                    {t('common.copy', 'Copy')}
                                </Button>
                            </div>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-lg p-3">
                            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">{t('settings.about.brew_quarantine_hint')}</p>
                            <div className="flex items-center justify-between gap-2">
                                <code className="text-xs text-amber-800 dark:text-amber-300 break-all">sudo xattr -rd com.apple.quarantine "/Applications/AMT.app"</code>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 h-7 text-xs text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                    onClick={() => {
                                        navigator.clipboard.writeText('sudo xattr -rd com.apple.quarantine "/Applications/AMT.app"');
                                        showToast(t('common.copied', 'Copied'), 'success');
                                    }}
                                >
                                    {t('common.copy', 'Copy')}
                                </Button>
                            </div>
                        </div>
                    </div>
                </ModalDialog>

                {/* Homebrew Upgrade Success Modal */}
                <ModalDialog
                    isOpen={isBrewSuccessOpen}
                    title={t('settings.about.brew_success_title')}
                    type="success"
                    confirmText={t('settings.about.brew_restart_btn')}
                    onConfirm={async () => {
                        try {
                            await relaunch();
                        } catch {
                            setIsBrewSuccessOpen(false);
                            showToast(t('settings.about.brew_restart_failed'), 'error');
                        }
                    }}
                >
                    <p className="text-sm text-muted-foreground">
                        {t('settings.about.brew_upgrade_success')}
                    </p>
                </ModalDialog>

                {/* 新版本自动更新确认弹窗 */}
                <ModalDialog
                    isOpen={isUpdateConfirmOpen}
                    title={t('settings.about.update_dialog_title', { defaultValue: '发现新版本可用' })}
                    type="confirm"
                    confirmText={t('settings.about.upgrade_now_btn', { defaultValue: '立即下载并自动更新' })}
                    cancelText={t('common.cancel', { defaultValue: '稍后再说' })}
                    onConfirm={handleConfirmUpdate}
                    onCancel={() => setIsUpdateConfirmOpen(false)}
                >
                    <div className="space-y-3 py-1 text-sm text-foreground">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            {t('settings.about.update_confirm_desc', {
                                defaultValue: '检测到最新版本，点击“立即下载并自动更新”将直接启动自动下载并在准备就绪后覆盖安装生效。',
                            })}
                        </p>
                        <div className="bg-muted/40 p-3 rounded-lg border border-border space-y-1.5 font-mono text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{t('settings.about.current_version')}:</span>
                                <span className="font-semibold text-foreground">{updateInfo?.currentVersion || appVersion}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{t('settings.about.latest_version_label', { defaultValue: '最新版本' })}:</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">{updateInfo?.latestVersion}</span>
                            </div>
                            {updateInfo?.source && (
                                <div className="text-[10px] text-muted-foreground text-right pt-1 border-t border-border">
                                    via {updateInfo.source}
                                </div>
                            )}
                        </div>
                    </div>
                </ModalDialog>
            </div >
        </div >
    );
}

export default Settings;
