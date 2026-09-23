import { useEffect, useState, useRef } from 'react';
import { Maximize2, RefreshCw, ShieldAlert, Tag, RadioTower } from 'lucide-react';
import { useViewStore } from '../../stores/useViewStore';
import { useAccountStore } from '../../stores/useAccountStore';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import { cn } from '../../utils/cn';
import { formatTimeRemaining } from '../../utils/format';
import { enterMiniMode, exitMiniMode } from '../../utils/windowManager';
import { findQuotaModel } from '../../config/modelConfig';
import { getVersion } from '@tauri-apps/api/app';
import { useConfigStore } from '../../stores/useConfigStore';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Account, getAccountTier } from '../../types/account';

function relayScore(account: Account) {
    const tier = getAccountTier(account);
    const tierWeight = tier === 'ultra' ? 300 : tier === 'pro' ? 200 : 100;
    return tierWeight
        + (findQuotaModel(account.quota?.models, 'claude')?.percentage ?? 0)
        + (findQuotaModel(account.quota?.models, 'gemini')?.percentage ?? findQuotaModel(account.quota?.models, 'gemini-pro')?.percentage ?? 0);
}

export default function MiniView() {
    const { setMiniView } = useViewStore();
    const { accounts, currentAccount, refreshQuota, fetchCurrentAccount, fetchAccounts, switchAccount } = useAccountStore();
    const { config } = useConfigStore();
    const { t } = useTranslation();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSwitching, setIsSwitching] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [appVersion, setAppVersion] = useState('0.0.0');

    useEffect(() => {
        const fetchVersion = async () => {
            try {
                const version = await getVersion();
                setAppVersion(version);
            } catch (error) {
                console.error('Failed to get app version:', error);
            }
        };
        fetchVersion();
    }, []);

    useEffect(() => {
        if (!config?.auto_refresh || !config?.refresh_interval || config.refresh_interval <= 0) return;

        const intervalId = setInterval(() => {
            if (!isRefreshing && currentAccount) {
                handleRefresh();
            }
        }, config.refresh_interval * 60 * 1000);

        return () => clearInterval(intervalId);
    }, [config?.auto_refresh, config?.refresh_interval, currentAccount, isRefreshing]);

    useEffect(() => {
        const adjustSize = async () => {
            if (containerRef.current) {
                const height = containerRef.current.scrollHeight;
                await enterMiniMode(height);
            }
        };

        const timer = setTimeout(adjustSize, 50);
        return () => clearTimeout(timer);
    }, [currentAccount]);

    const handleRefresh = async () => {
        if (!currentAccount || isRefreshing) return;
        setIsRefreshing(true);
        try {
            await refreshQuota(currentAccount.id);
            await fetchCurrentAccount();
        } finally {
            setTimeout(() => setIsRefreshing(false), 800);
        }
    };

    const handleMaximize = async () => {
        await exitMiniMode();
        setMiniView(false);
    };

    const handleMouseDown = () => {
        getCurrentWindow().startDragging();
    };

    const bestStandby = accounts
        .filter((account) => account.id !== currentAccount?.id && !account.disabled && !account.validation_blocked && !account.quota?.is_forbidden)
        .sort((a, b) => relayScore(b) - relayScore(a))[0];

    const handleRelay = async () => {
        if (!bestStandby || isSwitching) return;
        setIsSwitching(true);
        try {
            await switchAccount(bestStandby.id);
            await Promise.all([fetchAccounts(), fetchCurrentAccount()]);
        } finally {
            setIsSwitching(false);
        }
    };

    const geminiModel = findQuotaModel(currentAccount?.quota?.models, 'gemini') || findQuotaModel(currentAccount?.quota?.models, 'gemini-pro');
    const claudeModel = findQuotaModel(currentAccount?.quota?.models, 'claude');
    const gptModel = findQuotaModel(currentAccount?.quota?.models, 'gpt');

    const renderModelRow = (model: any, displayName: string) => {
        if (!model) return null;

        const getIndicatorClass = (p: number) => {
            if (p >= 50) return 'bg-emerald-500';
            if (p >= 20) return 'bg-amber-500';
            return 'bg-rose-500';
        };

        return (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-1">
                <div className="flex justify-between items-baseline">
                    <span className="text-xs font-medium text-muted-foreground">{displayName}</span>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-primary font-mono">
                            {model.reset_time ? `R: ${formatTimeRemaining(model.reset_time)}` : t('common.unknown')}
                        </span>
                        <span className="text-xs font-bold font-mono">
                            {model.percentage}%
                        </span>
                    </div>
                </div>
                <Progress
                    value={model.percentage}
                    className="h-1.5"
                    indicatorClassName={getIndicatorClass(model.percentage)}
                />
            </div>
        );
    };

    return (
        <div className="h-screen w-full flex items-center justify-center bg-transparent">
            <div
                ref={containerRef}
                className="w-[300px] flex flex-col bg-card/90 backdrop-blur-md shadow-2xl overflow-hidden border rounded-2xl animate-in fade-in zoom-in-95"
            >
                {/* Header / Drag Region */}
                <div
                    className="flex-none flex items-center justify-between px-4 py-2 bg-muted/30 border-b select-none"
                    onMouseDown={handleMouseDown}
                    data-tauri-drag-region
                >
                    <div className="flex items-center gap-2 text-sm font-semibold overflow-hidden">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse shrink-0" />
                        <span className="truncate" title={currentAccount?.email}>
                            {currentAccount?.custom_label || currentAccount?.email?.split('@')[0] || t('relay.unselected')}
                        </span>
                    </div>

                    <div
                        className="flex items-center gap-1 no-drag shrink-0"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <Button
                            variant="ghost"
                            size="iconSm"
                            onClick={handleRefresh}
                            title={t('common.refresh', 'Refresh')}
                        >
                            <RefreshCw size={14} className={cn(isRefreshing && "animate-spin text-primary")} />
                        </Button>
                        <div className="w-px h-3 bg-border mx-1" />
                        <Button
                            variant="ghost"
                            size="iconSm"
                            onClick={handleMaximize}
                            title={t('common.maximize', 'Full View')}
                        >
                            <Maximize2 size={14} />
                        </Button>
                    </div>
                </div>

                {/* Content Scroll Area */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4">
                    {!currentAccount ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground space-y-2 py-8">
                            <ShieldAlert size={32} />
                            <p className="text-sm">{t('relay.unselected')}</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {currentAccount.custom_label && (
                                <div className="flex items-center gap-1.5 pb-2 border-b">
                                    <Badge variant="secondary" className="gap-1 text-[10px]">
                                        <Tag className="w-2.5 h-2.5" />
                                        {currentAccount.custom_label}
                                    </Badge>
                                </div>
                            )}

                            {/* Models List */}
                            <div className="space-y-3">
                                {renderModelRow(geminiModel, 'Gemini')}
                                {renderModelRow(claudeModel, 'Claude')}
                                {renderModelRow(gptModel, 'GPT')}

                                {!geminiModel && !claudeModel && !gptModel && (
                                    <div className="text-center py-4 text-xs text-muted-foreground">
                                        {t('relay.no_quota')}
                                    </div>
                                )}
                            </div>
                            {bestStandby && (
                                <Button
                                    className="h-9 w-full rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                                    onClick={handleRelay}
                                    disabled={isSwitching}
                                >
                                    <RadioTower className={cn("mr-2 h-3.5 w-3.5", isSwitching && "animate-pulse")} />
                                    {isSwitching ? t('relay.relaying') : `${t('relay.relay_now')} · ${bestStandby.custom_label || bestStandby.email.split('@')[0]}`}
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Status */}
                <div className="flex-none h-8 bg-muted/20 flex items-center justify-between px-3 text-[10px] text-muted-foreground border-t">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>{t('relay.connected')}</span>
                    </div>
                    <span className="font-mono opacity-60">v{appVersion}</span>
                </div>
            </div>
        </div>
    );
}
