import type { ModelQuota, QuotaGroup } from '../types/account';
import { parseFlexibleDate, formatTimeRemaining } from './format';

// An exhausted weekly window takes precedence; protection still uses the backend quota.
export function getModelQuotaDisplay(modelId: string, model: ModelQuota | undefined, groups: QuotaGroup[] = []) {
    const name = modelId.toLowerCase();
    const thirdParty = name.startsWith('claude') || name.startsWith('gpt');
    const buckets = (groups || []).filter(group => {
        const groupName = (group?.display_name || '').toLowerCase();
        const isThirdParty = /claude|gpt|3p/.test(groupName)
            || (group?.buckets || []).some(bucket => /claude|gpt|3p/.test(bucket?.bucket_id?.toLowerCase() || ''));
        return thirdParty ? isThirdParty : name.startsWith('gemini') && !isThirdParty;
    }).flatMap(group => group?.buckets || []);
    const fiveHour = buckets.filter(bucket => /5h|hour/i.test(`${bucket.window} ${bucket.bucket_id}`))
        .reduce<(typeof buckets)[number] | undefined>((chosen, bucket) =>
            !chosen || bucket.remaining_fraction < chosen.remaining_fraction ? bucket : chosen, undefined);
    const weekly = buckets.filter(bucket => /week|7d/i.test(`${bucket.window} ${bucket.bucket_id}`)
        && bucket.remaining_fraction <= 0.001 && Date.parse(bucket.reset_time) > Date.now())
        .reduce<(typeof buckets)[number] | undefined>((chosen, bucket) =>
            !chosen || Date.parse(bucket.reset_time) > Date.parse(chosen.reset_time) ? bucket : chosen, undefined);
    return {
        percentage: weekly ? 0 : fiveHour ? Math.round(fiveHour.remaining_fraction * 100) : (model?.percentage ?? 0),
        resetTime: weekly?.reset_time || fiveHour?.reset_time || model?.reset_time,
        isWeeklyConstrained: !!weekly,
        weeklyResetTime: weekly?.reset_time,
    };
}

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

    const candidateBuckets = matchingGroups.flatMap(group => group?.buckets || []);
    const allBuckets = (groups || []).flatMap(group => group?.buckets || []);
    const sourceBuckets = candidateBuckets.length > 0 ? candidateBuckets : allBuckets;

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
        percentage: model?.percentage ?? 0,
        resetTime: model?.reset_time,
    };
}

export function formatQuotaResetTime(
    resetTime: string | undefined,
    percentage: number,
    quotaWindow: '5h' | 'weekly',
    t: (key: string, options?: any) => any
): string {
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
