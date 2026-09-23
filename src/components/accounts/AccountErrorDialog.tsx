import { Ban, Lock, Clock, ExternalLink, Copy, FileText } from 'lucide-react';
import { Account } from '../../types/account';
import { formatDate } from '../../utils/format';
import { useTranslation } from 'react-i18next';
import ModalDialog from '../common/ModalDialog';
import { useState } from 'react';
import { showToast } from '../common/ToastContainer';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';

interface AccountErrorDialogProps {
    account: Account | null;
    onClose: () => void;
}

export default function AccountErrorDialog({ account, onClose }: AccountErrorDialogProps) {
    const [showRaw, setShowRaw] = useState(false);
    const { t } = useTranslation();
    if (!account) return null;

    const isForbidden = !!account.quota?.is_forbidden;
    const isDisabled = Boolean(account.disabled);
    const isValidationBlocked = account.validation_blocked;

    const rawReason = account.validation_blocked_reason || account.disabled_reason || account.quota?.forbidden_reason || '';

    // 深度解析解析错误消息
    const extractErrorMessage = (raw: string) => {
        const trimmed = raw.trim();
        if (!trimmed) return raw;
        try {
            const parsed = JSON.parse(trimmed);
            let innerParsed = null;
            if (typeof parsed?.error === 'string') {
                try {
                    innerParsed = JSON.parse(parsed.error);
                } catch (_) { }
            }
            // 按照优先级尝试提取消息
            const msg = innerParsed?.error?.message
                || parsed?.error?.message
                || (Array.isArray(parsed?.error?.details) ? parsed.error.details[0]?.message : null)
                || parsed?.message
                || raw;
            return String(msg);
        } catch (_) {
            // 不处理
        }
        return raw;
    };

    const extractActionInfo = (raw: string): { url: string | null, label: string | null } => {
        const isSafeHttpUrl = (urlStr: string) => /^https?:\/\//i.test(urlStr.trim());

        if (account.validation_url && isSafeHttpUrl(account.validation_url)) {
            return { url: account.validation_url.trim(), label: null };
        }

        const trimmed = raw.trim();
        try {
            const parsed = JSON.parse(trimmed);
            // Google API 返回的链接通常在 metadata 中
            const metadata = parsed?.error?.details?.[0]?.metadata;
            let url = metadata?.appeal_url || metadata?.validation_url || parsed?.validation_url || parsed?.appeal_url;
            let label = metadata?.appeal_url_link_text || metadata?.validation_url_link_text || parsed?.appeal_url_link_text || parsed?.validation_url_link_text;

            if (!url && typeof parsed?.error === 'string') {
                try {
                    const innerParsed = JSON.parse(parsed.error);
                    const innerMeta = innerParsed?.error?.details?.[0]?.metadata;
                    url = innerMeta?.appeal_url || innerMeta?.validation_url;
                    label = innerMeta?.appeal_url_link_text || innerMeta?.validation_url_link_text;
                } catch (_) { }
            }

            if (url && isSafeHttpUrl(String(url))) {
                return { url: String(url).trim(), label: label ? String(label) : null };
            }
        } catch (_) { }

        // 最后降级到正则匹配
        const urlRegex = /https:\/\/[^\s"']+/g;
        const match = raw.match(urlRegex);
        if (match) {
            let extracted = match[0];
            extracted = extracted.replace(/\\u0026/g, '&').replace(/\\"/g, '').replace(/\\/g, '');
            if (extracted.endsWith(',')) {
                extracted = extracted.slice(0, -1);
            }
            if (isSafeHttpUrl(extracted)) {
                return { url: extracted.trim(), label: null };
            }
        }
        return { url: null, label: null };
    };

    const message = extractErrorMessage(rawReason);
    const { url: actionUrl, label: actionLabel } = extractActionInfo(rawReason);

    // 识别错误类型
    const isViolation = rawReason.toLowerCase().includes('terms of service') || rawReason.toLowerCase().includes('violation');
    const isVerificationNeeded = !isViolation && (rawReason.toLowerCase().includes('verify your account') || !!account.validation_url);

    // 复制功能
    const handleCopyUrl = (url: string) => {
        navigator.clipboard.writeText(url);
        showToast(t('accounts.validation_url_copied', '验证链接已复制到剪贴板'), 'success');
    };

    const renderMessageWithLinks = (text: string) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = text.split(urlRegex);
        return parts.map((part, i) => {
            if (part.match(urlRegex)) {
                return (
                    <a
                        key={i}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline hover:text-primary/80 break-all inline-flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {t('accounts.click_to_verify', '点击去验证')}
                        <ExternalLink className="w-3 h-3" />
                    </a>
                );
            }
            return part;
        });
    };

    return (
        <ModalDialog
            isOpen={true}
            title={t('accounts.error_details')}
            type="error"
            onConfirm={onClose}
            confirmText={t('common.close')}
        >
            <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 py-1">
                {/* Account Info */}
                <div>
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5 ml-1">
                        {t('accounts.account')}
                    </Label>
                    <div className="text-sm font-medium bg-muted/50 px-4 py-2.5 rounded-xl border shadow-sm">
                        {account.email}
                    </div>
                </div>

                {/* Status */}
                <div>
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5 ml-1">
                        {t('accounts.error_status')}
                    </Label>
                    <div className="flex flex-wrap gap-2">
                        {isForbidden && !isViolation && !isVerificationNeeded && !isValidationBlocked && (
                            <Badge variant="destructive" className="flex items-center gap-1.5 px-2.5 py-1">
                                <Lock className="w-3 h-3" />
                                {t('accounts.status.forbidden')}
                            </Badge>
                        )}
                        {isViolation && (
                            <Badge variant="destructive" className="flex items-center gap-1.5 px-2.5 py-1">
                                <Lock className="w-3 h-3" />
                                {t('accounts.status.violation_blocked', '由于违规被禁用')}
                            </Badge>
                        )}
                        {isDisabled && (
                            <Badge variant="destructive" className="flex items-center gap-1.5 px-2.5 py-1">
                                <Ban className="w-3 h-3" />
                                {t('accounts.status.disabled')}
                            </Badge>
                        )}
                        {(isValidationBlocked || isVerificationNeeded) && (
                            <Badge variant="warning" className="flex items-center gap-1.5 px-2.5 py-1">
                                <Clock className="w-3 h-3" />
                                {t('accounts.status.validation_required', '账号需验证')}
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Reason */}
                <div>
                    <div className="flex items-center justify-between mb-1.5 ml-1">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                            {t('common.reason', '原因')}
                        </Label>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowRaw(!showRaw)}
                            className="h-6 text-[10px] flex items-center gap-1 text-primary hover:text-primary/80"
                        >
                            <FileText className="w-2.5 h-2.5" />
                            {showRaw ? t('common.show_parsed', '显示解析后') : t('common.show_raw', '显示原始报文')}
                        </Button>
                    </div>
                    <div className="text-xs text-destructive bg-destructive/10 p-4 rounded-xl border border-destructive/20 break-all leading-relaxed font-mono shadow-inner min-h-[80px] max-h-[40vh] overflow-y-auto">
                        {showRaw ? (
                            <pre className="whitespace-pre-wrap break-all">{rawReason}</pre>
                        ) : (
                            message ? renderMessageWithLinks(message) : t('common.unknown')
                        )}
                    </div>

                    {/* Action Buttons for Verification / Appeal */}
                    {actionUrl && !showRaw && (
                        <div className="mt-3 flex gap-2">
                            <Button
                                asChild
                                className="flex-1"
                            >
                                <a
                                    href={actionUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                    {actionLabel || (isViolation ? t('accounts.go_to_appeal', '前往申诉') : t('accounts.click_to_verify', '点击去验证'))}
                                </a>
                            </Button>
                            <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => handleCopyUrl(actionUrl)}
                            >
                                <Copy className="w-3.5 h-3.5 mr-1.5" />
                                {isViolation ? t('accounts.copy_appeal_url', '复制申诉链接') : t('accounts.copy_validation_url', '复制验证链接')}
                            </Button>
                        </div>
                    )}

                </div>

                {/* Time */}
                <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500 pl-1">
                    <Clock size={12} strokeWidth={2.5} />
                    <span>
                        {t('accounts.error_time')}: {account.disabled_at ? formatDate(account.disabled_at) : (account.quota?.last_updated ? formatDate(account.quota.last_updated) : t('common.unknown'))}
                    </span>
                </div>
            </div>
        </ModalDialog>
    );
}
