import type { ModelQuota, QuotaGroup } from '../types/account';
import { parseFlexibleDate, formatTimeRemaining } from './format';

export function getCategoryQuotaDisplay(
    category: string,
    model: ModelQuota | undefined,
    groups: QuotaGroup[] = [],
    window: '5h' | 'weekly' = '5h'
) {
    const name = category.toLowerCase();
    const isThirdParty = name.startsWith('claude') || name.startsWith('gpt');

    const matchingGroups = (groups || []).filter(group => {
        const groupName = (group?.display_name || '').toLowerCase();
        const has3p = /claude|gpt|3p/.test(groupName)
            || (group?.buckets || []).some(bucket => /claude|gpt|3p/.test(bucket?.bucket_id?.toLowerCase() || ''));
        return isThirdParty ? has3p : !has3p;
    });

    const sourceBuckets = matchingGroups.flatMap(group => group?.buckets || []);

    if (window === 'weekly') {
        const weeklyBuckets = sourceBuckets.filter(b => {
            const str = `${b.window || ''} ${b.bucket_id || ''} ${b.display_name || ''}`.toLowerCase();
            return /week|7d|168h/i.test(str);
        });
        const weeklyBucket = weeklyBuckets.sort((a, b) => a.remaining_fraction - b.remaining_fraction)[0];
        if (weeklyBucket) {
            return {
                percentage: Math.round(weeklyBucket.remaining_fraction * 100),
                resetTime: weeklyBucket.reset_time,
            };
        }
        return { percentage: null, resetTime: undefined };
    }

    // 5H window
    const fiveHourBuckets = sourceBuckets.filter(b => {
        const str = `${b.window || ''} ${b.bucket_id || ''} ${b.display_name || ''}`.toLowerCase();
        return /5h|hour/i.test(str);
    });
    const fiveHourBucket = fiveHourBuckets.sort((a, b) => a.remaining_fraction - b.remaining_fraction)[0];

    if (fiveHourBucket) {
        return {
            percentage: Math.round(fiveHourBucket.remaining_fraction * 100),
            resetTime: fiveHourBucket.reset_time,
        };
    }

    return {
        percentage: model?.percentage ?? null,
        resetTime: model?.reset_time,
    };
}

export function formatQuotaResetTime(
    resetTime: string | undefined,
    percentage: number | null,
    quotaWindow: '5h' | 'weekly',
    t: (key: string, options?: any) => any
): string {
    if (percentage === null) {
        return t(quotaWindow === 'weekly' ? 'accounts.details.no_weekly_data' : 'relay.no_quota');
    }
    if (!resetTime || !resetTime.trim()) {
        if (quotaWindow === 'weekly') {
            return t('accounts.details.no_weekly_data', { defaultValue: '未同步到周限数据' });
        }
        return percentage === 100 ? t('accounts.details.ample', { defaultValue: '已就绪' }) : t('accounts.details.recovering', { defaultValue: '恢复中' });
    }

    const targetDate = parseFlexibleDate(resetTime);
    if (!targetDate) {
        return t('common.unknown', { defaultValue: '未知' });
    }

    const now = new Date();
    const diffMs = targetDate.getTime() - now.getTime();

    if (diffMs <= 0) {
        return percentage === 100 ? t('accounts.details.ample', { defaultValue: '已就绪' }) : '0h 0m';
    }

    return formatTimeRemaining(resetTime);
}
