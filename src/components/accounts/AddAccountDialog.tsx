import { useState, useEffect, useRef } from 'react';
import { Plus, Database, Globe, FileClock, Loader2, CheckCircle2, XCircle, Copy, Check, Link2 } from 'lucide-react';
import { useAccountStore } from '../../stores/useAccountStore';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { request as invoke } from '../../utils/request';
import { copyToClipboard } from '../../utils/clipboard';
import { cn } from '../../utils/cn';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';

interface AddAccountDialogProps {
    onAdd: (email: string, refreshToken: string) => Promise<void>;
    showText?: boolean;
    triggerClass?: string;
    buttonVariant?: "default" | "outline" | "secondary";
}

type Status = 'idle' | 'loading' | 'success' | 'error';

function AddAccountDialog({ onAdd, showText = true, triggerClass, buttonVariant = "outline" }: AddAccountDialogProps) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'oauth' | 'token' | 'import'>('oauth');
    const [refreshToken, setRefreshToken] = useState('');
    const [oauthUrl, setOauthUrl] = useState('');
    const [oauthUrlCopied, setOauthUrlCopied] = useState(false);
    const [manualCode, setManualCode] = useState('');

    // UI State
    const [status, setStatus] = useState<Status>('idle');
    const [message, setMessage] = useState('');

    const { startOAuthLogin, completeOAuthLogin, cancelOAuthLogin, importFromDb, importV1Accounts, importFromCustomDb } = useAccountStore();

    const oauthUrlRef = useRef(oauthUrl);
    const statusRef = useRef(status);
    const activeTabRef = useRef(activeTab);
    const isOpenRef = useRef(isOpen);

    useEffect(() => {
        oauthUrlRef.current = oauthUrl;
        statusRef.current = status;
        activeTabRef.current = activeTab;
        isOpenRef.current = isOpen;
    }, [oauthUrl, status, activeTab, isOpen]);

    // Reset state when dialog opens or tab changes
    useEffect(() => {
        if (isOpen) {
            resetState();
        }
    }, [isOpen, activeTab]);

    // Listen for OAuth URL
    useEffect(() => {
        let unlisten: (() => void) | undefined;

        const setupListener = async () => {
            unlisten = await listen('oauth-url-generated', (event) => {
                setOauthUrl(event.payload as string);
                // 自动复制到剪贴板? 可选，这里只设置状态让用户手动复制
            });
        };

        setupListener();

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    // Listen for OAuth callback completion (user may open the URL manually without clicking Start)
    useEffect(() => {
        let unlisten: (() => void) | undefined;

        const setupListener = async () => {
            unlisten = await listen('oauth-callback-received', async () => {
                if (!isOpenRef.current) return;
                if (activeTabRef.current !== 'oauth') return;
                if (statusRef.current === 'loading' || statusRef.current === 'success') return;
                if (!oauthUrlRef.current) return;

                // Auto-complete: exchange code and save account (no browser open)
                setStatus('loading');
                setMessage(`${t('accounts.add.tabs.oauth')}...`);

                try {
                    await completeOAuthLogin();
                    setStatus('success');
                    setMessage(`${t('accounts.add.tabs.oauth')} ${t('common.success')}!`);
                    setTimeout(() => {
                        setIsOpen(false);
                        resetState();
                    }, 1500);
                } catch (error) {
                    setStatus('error');
                    let errorMsg = String(error);
                    if (errorMsg.includes('Refresh Token') || errorMsg.includes('refresh_token')) {
                        setMessage(errorMsg);
                    } else if (errorMsg.includes('Tauri') || errorMsg.toLowerCase().includes('environment') || errorMsg.includes('环境')) {
                        setMessage(t('common.environment_error', { error: errorMsg }));
                    } else {
                        setMessage(`${t('accounts.add.tabs.oauth')} ${t('common.error')}: ${errorMsg}`);
                    }
                }
            });
        };

        setupListener();

        return () => {
            if (unlisten) unlisten();
        };
    }, [completeOAuthLogin, t]);

    // Pre-generate OAuth URL when dialog opens on OAuth tab (so URL is shown BEFORE "Start OAuth")
    useEffect(() => {
        if (!isOpen) return;
        if (activeTab !== 'oauth') return;
        if (oauthUrl) return;

        invoke<any>('prepare_oauth_url')
            .then((res) => {
                const url = typeof res === 'string' ? res : res?.url;
                if (url && url.length > 0) setOauthUrl(url);
            })
            .catch((e) => {
                console.error('Failed to prepare OAuth URL:', e);
            });
    }, [isOpen, activeTab, oauthUrl]);

    // If user navigates away from OAuth tab, cancel prepared flow to release the port.
    useEffect(() => {
        if (!isOpen) return;
        if (activeTab === 'oauth') return;
        if (!oauthUrl) return;

        cancelOAuthLogin().catch(() => { });
        setOauthUrl('');
        setOauthUrlCopied(false);
    }, [isOpen, activeTab]);

    const resetState = () => {
        setStatus('idle');
        setMessage('');
        setRefreshToken('');
        setOauthUrl('');
        setOauthUrlCopied(false);
    };

    const handleAction = async (
        actionName: string,
        actionFn: () => Promise<any>,
        options?: { clearOauthUrl?: boolean }
    ) => {
        setStatus('loading');
        setMessage(`${actionName}...`);
        if (options?.clearOauthUrl !== false) {
            setOauthUrl(''); // Clear previous URL
        }
        try {
            await actionFn();
            setStatus('success');
            setMessage(`${actionName} ${t('common.success')}!`);

            // 延迟关闭,让用户看到成功状态
            setTimeout(() => {
                setIsOpen(false);
                resetState();
            }, 1500);
        } catch (error) {
            setStatus('error');

            // 改进错误信息显示
            let errorMsg = String(error);

            // 如果是 refresh_token 缺失错误,显示完整信息(包含解决方案)
            if (errorMsg.includes('Refresh Token') || errorMsg.includes('refresh_token')) {
                setMessage(errorMsg);
            } else if (errorMsg.includes('Tauri') || errorMsg.toLowerCase().includes('environment') || errorMsg.includes('环境')) {
                // 环境错误
                setMessage(t('common.environment_error', { error: errorMsg }));
            } else {
                // 其他错误
                setMessage(`${actionName} ${t('common.error')}: ${errorMsg}`);
            }
        }
    };

    const handleSubmit = async () => {
        if (!refreshToken) {
            setStatus('error');
            setMessage(t('accounts.add.token.error_token'));
            return;
        }

        setStatus('loading');

        // 1. 尝试解析输入
        let tokens: string[] = [];
        const input = refreshToken.trim();

        try {
            // 尝试解析为 JSON
            if (input.startsWith('[') && input.endsWith(']')) {
                const parsed = JSON.parse(input);
                if (Array.isArray(parsed)) {
                    tokens = parsed
                        .map((item: any) => item.refresh_token)
                        .filter((t: any) => typeof t === 'string' && t.startsWith('1//'));
                }
            }
        } catch (e) {
            // JSON 解析失败,忽略
            console.debug('JSON parse failed, falling back to regex', e);
        }

        // 2. 如果 JSON 解析没有结果,尝试正则提取 (或者输入不是 JSON)
        if (tokens.length === 0) {
            const regex = /1\/\/[a-zA-Z0-9_\-]+/g;
            const matches = input.match(regex);
            if (matches) {
                tokens = matches;
            }
        }

        // 去重
        tokens = [...new Set(tokens)];

        if (tokens.length === 0) {
            setStatus('error');
            setMessage(t('accounts.add.token.error_token')); // 或者提示"未找到有效 Token"
            return;
        }

        // 3. 批量添加
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < tokens.length; i++) {
            const currentToken = tokens[i];
            setMessage(t('accounts.add.token.batch_progress', { current: i + 1, total: tokens.length }));

            try {
                await onAdd("", currentToken);
                successCount++;
            } catch (error) {
                console.error(`Failed to add token ${i + 1}:`, error);
                failCount++;
            }
            // 稍微延迟一下,避免太快
            await new Promise(r => setTimeout(r, 100));
        }

        // 4. 结果反馈
        if (successCount === tokens.length) {
            setStatus('success');
            setMessage(t('accounts.add.token.batch_success', { count: successCount }));
            setTimeout(() => {
                setIsOpen(false);
                resetState();
            }, 1500);
        } else if (successCount > 0) {
            // 部分成功
            setStatus('success'); // 还是用绿色,但提示部分失败
            setMessage(t('accounts.add.token.batch_partial', { success: successCount, fail: failCount }));
            // 不自动关闭,让用户看到结果
        } else {
            // 全部失败
            setStatus('error');
            setMessage(t('accounts.add.token.batch_fail'));
        }
    };

    const handleOAuth = () => {
        // Default flow: opens the default browser and completes automatically.
        // (If user opened the URL manually, completion is also triggered by oauth-callback-received.)
        handleAction(t('accounts.add.tabs.oauth'), startOAuthLogin, { clearOauthUrl: false });
    };

    const handleCompleteOAuth = () => {
        // Manual flow: user already authorized in their preferred browser, just finish the flow.
        handleAction(t('accounts.add.tabs.oauth'), completeOAuthLogin, { clearOauthUrl: false });
    };

    const handleCopyUrl = async () => {
        if (oauthUrl) {
            const success = await copyToClipboard(oauthUrl);
            if (success) {
                setOauthUrlCopied(true);
                window.setTimeout(() => setOauthUrlCopied(false), 1500);
            }
        }
    };

    const handleManualSubmit = async () => {
        if (!manualCode.trim()) return;

        setStatus('loading');
        setMessage(t('accounts.add.oauth.manual_submitting', '認可コードを送信中...'));

        try {
            await invoke('submit_oauth_code', { code: manualCode.trim(), state: null });

            // 提交成功反馈
            setStatus('success');
            setMessage(t('accounts.add.oauth.manual_submitted', '認可コードを送信しました。バックエンドで処理中です...'));

            setManualCode('');

        } catch (error) {
            let errStr = String(error);
            if (errStr.includes("No active OAuth flow")) {
                setMessage(t('accounts.add.oauth.error_no_flow'));
                setStatus('error');
            } else {
                setMessage(`${t('common.error')}: ${errStr}`);
                setStatus('error');
            }
        }
    };

    const handleImportDb = () => {
        handleAction(t('accounts.add.import.btn_db'), async () => {
            const accounts = await importFromDb();
            if (Array.isArray(accounts) && accounts.length > 0) {
                setMessage(t('accounts.add.token.batch_success', { count: accounts.length }));
            }
            return accounts;
        });
    };

    const handleImportV1 = () => {
        handleAction(t('accounts.add.import.btn_v1'), importV1Accounts);
    };

    const handleImportCustomDb = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'VSCode DB',
                    extensions: ['vscdb']
                }, {
                    name: 'All Files',
                    extensions: ['*']
                }]
            });

            if (selected && typeof selected === 'string') {
                handleAction(t('accounts.add.import.btn_custom_db') || 'Import Custom DB', () => importFromCustomDb(selected));
            }
        } catch (err) {
            console.error('Failed to open dialog:', err);
        }
    };

    // 状态提示组件
    const StatusAlert = () => {
        if (status === 'idle' || !message) return null;

        const styles = {
            loading: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
            success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
            error: 'bg-destructive/10 text-destructive border-destructive/20'
        };

        const icons = {
            loading: <Loader2 className="w-4 h-4 animate-spin shrink-0" />,
            success: <CheckCircle2 className="w-4 h-4 shrink-0" />,
            error: <XCircle className="w-4 h-4 shrink-0" />
        };

        return (
            <div className={cn("flex items-center gap-2 rounded-lg border p-3 mb-4 text-xs font-medium shadow-sm", styles[status])}>
                {icons[status]}
                <span>{message}</span>
            </div>
        );
    };

    return (
        <>
            <Button
                variant={buttonVariant}
                size="sm"
                className={cn("gap-2 shadow-sm relative z-10", triggerClass)}
                onClick={() => setIsOpen(true)}
                title={!showText ? t('accounts.add_account') : undefined}
            >
                <Plus className="w-4 h-4" />
                {showText && <span>{t('accounts.add_account')}</span>}
            </Button>

            <Dialog open={isOpen} onOpenChange={async (open) => {
                if (!open && status === 'loading' && activeTab === 'oauth') {
                    await cancelOAuthLogin();
                }
                setIsOpen(open);
            }}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold">{t('accounts.add.title')}</DialogTitle>
                    </DialogHeader>

                    {/* Tab 导航 */}
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                        <TabsList className="grid grid-cols-4 w-full mb-5 rounded-xl">
                            <TabsTrigger value="oauth" className="col-span-2 rounded-lg">{t('accounts.add.tabs.oauth')}</TabsTrigger>
                            <TabsTrigger value="token">{t('accounts.add.tabs.token')}</TabsTrigger>
                            <TabsTrigger value="import">{t('accounts.add.tabs.import')}</TabsTrigger>
                        </TabsList>

                        {/* 状态提示区 */}
                        <StatusAlert />

                        <div className="min-h-[200px]">
                            {/* OAuth 授权 */}
                            <TabsContent value="oauth" className="space-y-5 mt-0">
                                <div className="text-center space-y-3 py-2">
                                    <div className="bg-primary/10 p-4 rounded-2xl w-14 h-14 mx-auto flex items-center justify-center">
                                        <Globe className="w-7 h-7 text-primary" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-medium">{t('accounts.add.oauth.recommend')}</h4>
                                        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                                            {t('accounts.add.oauth.desc')}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Button
                                        className="w-full h-11 rounded-xl shadow-sm"
                                        onClick={handleOAuth}
                                        disabled={status === 'loading' || status === 'success'}
                                    >
                                        {status === 'loading' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                        {status === 'loading' ? t('accounts.add.oauth.btn_waiting') : t('accounts.add.oauth.btn_start')}
                                    </Button>

                                    {oauthUrl && (
                                        <div className="space-y-2">
                                            <div className="text-[11px] text-muted-foreground text-left">
                                                {t('accounts.add.oauth.link_label')}
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full justify-between gap-2 border-dashed h-auto py-2 px-3"
                                                onClick={handleCopyUrl}
                                                title={t('accounts.add.oauth.link_click_to_copy')}
                                            >
                                                {oauthUrlCopied ? (
                                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                ) : (
                                                    <Copy className="w-3.5 h-3.5" />
                                                )}
                                                <code className="text-[11px] font-mono truncate flex-1 text-left">
                                                    {oauthUrl}
                                                </code>
                                                <span className="text-[11px] whitespace-nowrap">
                                                    {oauthUrlCopied ? t('accounts.add.oauth.copied') : t('accounts.add.oauth.copy_link')}
                                                </span>
                                            </Button>

                                            <Button
                                                type="button"
                                                variant="secondary"
                                                className="w-full gap-2"
                                                onClick={handleCompleteOAuth}
                                                disabled={status === 'loading' || status === 'success'}
                                            >
                                                <CheckCircle2 className="w-4 h-4" />
                                                {t('accounts.add.oauth.btn_finish')}
                                            </Button>
                                        </div>
                                    )}

                                    {/* Manual Code Entry */}
                                    <div className="pt-4 mt-2 border-t space-y-2">
                                        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                                            {t('accounts.add.oauth.manual_hint')}
                                        </div>
                                        <div className="flex gap-2">
                                            <Input
                                                type="text"
                                                placeholder={t('accounts.add.oauth.manual_placeholder')}
                                                value={manualCode}
                                                onChange={(e) => setManualCode(e.target.value)}
                                                className="text-xs"
                                            />
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="gap-1.5"
                                                onClick={handleManualSubmit}
                                                disabled={!manualCode.trim()}
                                            >
                                                <Link2 className="w-3.5 h-3.5" />
                                                {t('common.submit')}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            {/* Refresh Token */}
                            <TabsContent value="token" className="space-y-4 mt-0">
                                <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
                                    <span className="text-sm font-medium text-muted-foreground">{t('accounts.add.token.label')}</span>
                                    <Textarea
                                        className="h-32 resize-none rounded-xl font-mono text-xs"
                                        placeholder={t('accounts.add.token.placeholder')}
                                        value={refreshToken}
                                        onChange={(e) => setRefreshToken(e.target.value)}
                                        disabled={status === 'loading' || status === 'success'}
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        {t('accounts.add.token.hint')}
                                    </p>
                                </div>
                            </TabsContent>

                            {/* 从数据库导入 */}
                            <TabsContent value="import" className="space-y-5 mt-0">
                                <div className="space-y-3">
                                    <div>
                                        <h4 className="font-semibold flex items-center gap-2 text-sm">
                                            <Database className="w-4 h-4 text-muted-foreground" />
                                            {t('accounts.add.import.scheme_a')}
                                        </h4>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {t('accounts.add.import.scheme_a_desc')}
                                        </p>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <Button
                                            variant="outline"
                                            className="w-full justify-start gap-2 shadow-sm"
                                            onClick={handleImportDb}
                                            disabled={status === 'loading' || status === 'success'}
                                        >
                                            <CheckCircle2 className="w-4 h-4" />
                                            {t('accounts.add.import.btn_db')}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-start gap-2 shadow-sm"
                                            onClick={handleImportCustomDb}
                                            disabled={status === 'loading' || status === 'success'}
                                        >
                                            <Database className="w-4 h-4" />
                                            {t('accounts.add.import.btn_custom_db') || 'Custom DB (state.vscdb)'}
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    <div className="flex-1 h-px bg-border" />
                                    <span>{t('accounts.add.import.or')}</span>
                                    <div className="flex-1 h-px bg-border" />
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <h4 className="font-semibold flex items-center gap-2 text-sm">
                                            <FileClock className="w-4 h-4 text-muted-foreground" />
                                            {t('accounts.add.import.scheme_b')}
                                        </h4>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {t('accounts.add.import.scheme_b_desc')}
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="w-full justify-start gap-2 shadow-sm"
                                        onClick={handleImportV1}
                                        disabled={status === 'loading' || status === 'success'}
                                    >
                                        <FileClock className="w-4 h-4" />
                                        {t('accounts.add.import.btn_v1')}
                                    </Button>
                                </div>
                            </TabsContent>
                        </div>
                    </Tabs>

                    <DialogFooter className="flex-row justify-end gap-2 mt-4 sm:justify-end">
                        <Button
                            variant="outline"
                            onClick={async () => {
                                if (status === 'loading' && activeTab === 'oauth') {
                                    await cancelOAuthLogin();
                                }
                                setIsOpen(false);
                            }}
                            disabled={status === 'success'}
                        >
                            {t('accounts.add.btn_cancel')}
                        </Button>
                        {activeTab === 'token' && (
                            <Button
                                onClick={handleSubmit}
                                disabled={status === 'loading' || status === 'success'}
                            >
                                {status === 'loading' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                {t('accounts.add.btn_confirm')}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default AddAccountDialog;
