import { useMemo } from 'react';
import { Clock, AlertCircle, Bot, Zap, Sparkles, Cpu, Info } from 'lucide-react';
import { Account, getAccountTier, getTierLabel } from '../../types/account';
import { formatDate } from '../../utils/format';
import { useTranslation } from 'react-i18next';
import { cn } from '../../utils/cn';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';

interface AccountDetailsDialogProps {
    account: Account | null;
    onClose: () => void;
}

interface QuotaPool {
    id: string;
    name: string;
    subtitle: string;
    icon: any;
    iconBg: string;
    iconColor: string;
    percentage: number;
    resetTime?: string;
    weeklyPercentage?: number;
    variants: string[];
}

export default function AccountDetailsDialog({ account, onClose }: AccountDetailsDialogProps) {
    const { t } = useTranslation();

    const tier = account ? getAccountTier(account) : 'free';
    const label = account ? getTierLabel(tier) : '';

    const getBadgeVariant = (t: string) => {
        if (t === 'ultra') return 'default';
        if (t === 'pro') return 'secondary';
        return 'outline';
    };

    const getIndicatorClass = (p: number) => {
        if (p >= 50) return 'bg-emerald-500';
        if (p >= 20) return 'bg-amber-500';
        return 'bg-rose-500';
    };

    // 智能配额池聚合算法：始终无条件执行 Hook，确保 Hook 调用顺序恒定
    const quotaPools = useMemo<QuotaPool[]>(() => {
        if (!account) return [];
        const models = account.quota?.models || [];
        const groups = account.quota?.quota_groups || [];

        // 查找对应配额桶 (5h / weekly)
        const getBucket = (poolKey: 'claude' | 'pro' | 'flash' | 'gpt', window: '5h' | 'weekly') => {
            return groups
                .flatMap((g) => g.buckets || [])
                .find((b) => {
                    const dName = (b.display_name || '').toLowerCase();
                    const bId = (b.bucket_id || '').toLowerCase();
                    const matchWindow = b.window === window;
                    if (!matchWindow) return false;
                    if (poolKey === 'claude') return dName.includes('claude') || bId.includes('claude') || dName.includes('gpt');
                    if (poolKey === 'pro') return dName.includes('pro') && !dName.includes('flash');
                    if (poolKey === 'flash') return dName.includes('flash') || dName.includes('gemini') || bId.includes('flash');
                    return false;
                });
        };

        const claudeModels = models.filter((m) => m.name.toLowerCase().includes('claude'));
        const proModels = models.filter(
            (m) =>
                m.name.toLowerCase().includes('pro') &&
                !m.name.toLowerCase().includes('flash') &&
                !m.name.toLowerCase().includes('image')
        );
        const flashModels = models.filter(
            (m) =>
                m.name.toLowerCase().includes('flash') ||
                m.name.toLowerCase().includes('image') ||
                (m.name.toLowerCase().includes('gemini') && !m.name.toLowerCase().includes('pro'))
        );
        const otherModels = models.filter(
            (m) => !claudeModels.includes(m) && !proModels.includes(m) && !flashModels.includes(m)
        );

        const result: QuotaPool[] = [];

        // 1. Gemini Flash 极速池 (解决原先 14 个 Flash 变体狂轰滥炸的问题)
        if (flashModels.length > 0) {
            const rep = flashModels[0];
            const bWeekly = getBucket('flash', 'weekly');
            result.push({
                id: 'gemini-flash',
                name: 'Gemini Flash 极速池',
                subtitle: '日常敏捷补全与快速代码推理 · 共享统一配额桶',
                icon: Zap,
                iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
                iconColor: 'text-purple-600 dark:text-purple-400',
                percentage: Math.round(rep.percentage),
                resetTime: rep.reset_time,
                weeklyPercentage: bWeekly ? Math.round(bWeekly.remaining_fraction * 100) : undefined,
                variants: Array.from(new Set(flashModels.map((m) => m.display_name || m.name))),
            });
        }

        // 2. Claude 高阶智囊池
        if (claudeModels.length > 0) {
            const rep = claudeModels[0];
            const bWeekly = getBucket('claude', 'weekly');
            result.push({
                id: 'claude',
                name: 'Claude 高阶智囊池',
                subtitle: '复杂任务重构与长上下文思维 · Sonnet 家族共享',
                icon: Bot,
                iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                iconColor: 'text-blue-600 dark:text-blue-400',
                percentage: Math.round(rep.percentage),
                resetTime: rep.reset_time,
                weeklyPercentage: bWeekly ? Math.round(bWeekly.remaining_fraction * 100) : undefined,
                variants: Array.from(new Set(claudeModels.map((m) => m.display_name || m.name))),
            });
        }

        // 3. Gemini Pro 旗舰池
        if (proModels.length > 0) {
            const rep = proModels[0];
            const bWeekly = getBucket('pro', 'weekly');
            result.push({
                id: 'gemini-pro',
                name: 'Gemini Pro 旗舰池',
                subtitle: '深度代码架构与多模态核心推理 · Pro 家族共享',
                icon: Sparkles,
                iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                iconColor: 'text-emerald-600 dark:text-emerald-400',
                percentage: Math.round(rep.percentage),
                resetTime: rep.reset_time,
                weeklyPercentage: bWeekly ? Math.round(bWeekly.remaining_fraction * 100) : undefined,
                variants: Array.from(new Set(proModels.map((m) => m.display_name || m.name))),
            });
        }

        // 4. GPT-OSS / 开源模型池
        if (otherModels.length > 0) {
            const rep = otherModels[0];
            result.push({
                id: 'other',
                name: otherModels.length === 1 ? (otherModels[0].display_name || '独立托管模型') : '独立 / 开源模型池',
                subtitle: '专用基座与第三方开源模型配额',
                icon: Cpu,
                iconBg: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
                iconColor: 'text-slate-600 dark:text-slate-400',
                percentage: Math.round(rep.percentage),
                resetTime: rep.reset_time,
                variants: Array.from(new Set(otherModels.map((m) => m.display_name || m.name))),
            });
        }

        return result;
    }, [account]);

    if (!account) return null;

    return (
        <Dialog open={Boolean(account)} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0 rounded-3xl border border-border shadow-2xl">
                {/* 1. Header */}
                <DialogHeader className="px-6 py-4 border-b border-border bg-muted/30 flex flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <DialogTitle className="text-lg font-bold">{t('accounts.details.title', '配额详情')}</DialogTitle>
                        <Badge variant="outline" className="font-mono text-xs font-normal">
                            {account.email}
                        </Badge>
                        <Badge variant={getBadgeVariant(tier)} className="uppercase text-[10px] font-black">
                            {label}
                        </Badge>
                    </div>
                </DialogHeader>

                {/* 2. 状态告警横幅 */}
                {account.disabled && (
                    <div className="px-6 py-2.5 bg-destructive/10 border-b border-destructive/20 flex flex-col gap-1 text-xs text-destructive">
                        {account.disabled && (
                            <div className="flex items-center gap-2">
                                <AlertCircle size={14} />
                                <span className="font-semibold">{t('accounts.status.disabled')}:</span>
                                <span>{account.disabled_reason || t('common.unknown')}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* 3. 聚合说明条 */}
                <div className="px-6 py-2.5 bg-blue-500/10 border-b border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 shrink-0" />
                        <span>底层配额已自动池化聚合：同属一个配额桶的模型共享额度与重置时间。</span>
                    </div>
                    <span className="font-mono text-[11px] font-bold shrink-0 ml-2">
                        {quotaPools.length} 个独立算力池
                    </span>
                </div>

                {/* 4. 主体卡片网格 */}
                <div className="p-6 overflow-y-auto flex-1 space-y-5">
                    {quotaPools.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {quotaPools.map((pool) => (
                                <div
                                    key={pool.id}
                                    className="p-4 rounded-2xl border border-border/80 bg-card shadow-xs hover:border-border transition-all flex flex-col justify-between"
                                >
                                    <div>
                                        {/* 卡片头部 */}
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div
                                                    className={cn(
                                                        'w-8 h-8 rounded-xl flex items-center justify-center font-bold shrink-0',
                                                        pool.iconBg
                                                    )}
                                                >
                                                    <pool.icon className={cn('w-4 h-4', pool.iconColor)} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-bold text-foreground truncate">
                                                        {pool.name}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground truncate">
                                                        {pool.subtitle}
                                                    </div>
                                                </div>
                                            </div>
                                            <Badge
                                                variant={
                                                    pool.percentage >= 50
                                                        ? 'success'
                                                        : pool.percentage >= 20
                                                        ? 'warning'
                                                        : 'destructive'
                                                }
                                                className="font-mono text-xs px-2 py-0.5 shrink-0"
                                            >
                                                {pool.percentage}%
                                            </Badge>
                                        </div>

                                        {/* 5H 滑动配额 */}
                                        <div className="space-y-1 mb-3">
                                            <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-muted-foreground font-medium">
                                                    5H 滑动配额
                                                </span>
                                                <span className="font-mono font-bold text-foreground">
                                                    {pool.percentage}%
                                                </span>
                                            </div>
                                            <Progress
                                                value={pool.percentage}
                                                className="h-2"
                                                indicatorClassName={getIndicatorClass(pool.percentage)}
                                            />
                                            {pool.resetTime && (
                                                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-0.5">
                                                    <span className="flex items-center gap-1 truncate">
                                                        <Clock className="w-3 h-3 shrink-0" />
                                                        重置时间: {formatDate(pool.resetTime)}
                                                    </span>
                                                    {pool.percentage < 100 && (
                                                        <span className="text-amber-600 dark:text-amber-400 font-medium shrink-0 ml-1">
                                                            恢复中
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* 7天周配额 (若提供) */}
                                        {typeof pool.weeklyPercentage === 'number' && (
                                            <div className="space-y-1 mb-3">
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span className="text-muted-foreground font-medium">
                                                        7天周配额上限
                                                    </span>
                                                    <span className="font-mono font-bold text-foreground">
                                                        {pool.weeklyPercentage}%
                                                    </span>
                                                </div>
                                                <Progress
                                                    value={pool.weeklyPercentage}
                                                    className="h-1.5"
                                                    indicatorClassName={getIndicatorClass(pool.weeklyPercentage)}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* 底部变体微标标签 */}
                                    <div className="pt-3 border-t border-border/60 mt-1">
                                        <div className="text-[10px] text-muted-foreground mb-1.5 flex items-center justify-between">
                                            <span>共享此配额的 {pool.variants.length} 个模型变体：</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                                            {pool.variants.map((v, i) => (
                                                <span
                                                    key={i}
                                                    className="px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-mono"
                                                    title={v}
                                                >
                                                    {v.replace(/^Gemini\s+/i, '').replace(/^Claude\s+/i, '')}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 text-center text-muted-foreground flex flex-col items-center">
                            <AlertCircle className="w-8 h-8 mb-2 opacity-20" />
                            <span>{t('accounts.no_data', '暂无配额数据')}</span>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
