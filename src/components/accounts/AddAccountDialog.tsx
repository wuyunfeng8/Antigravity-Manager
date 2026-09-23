import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Database,
  Globe,
  FileClock,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Link2,
  KeyRound,
  ChevronDown,
  FolderOpen,
  Sparkles,
} from 'lucide-react';
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
  DialogDescription,
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
  const [showManual, setShowManual] = useState(false);

  // UI State
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  const {
    startOAuthLogin,
    completeOAuthLogin,
    cancelOAuthLogin,
    importFromDb,
    importV1Accounts,
    importFromCustomDb,
  } = useAccountStore();

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
      });
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Listen for OAuth callback completion
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen('oauth-callback-received', async () => {
        if (!isOpenRef.current) return;
        if (activeTabRef.current !== 'oauth') return;
        if (statusRef.current === 'loading' || statusRef.current === 'success') return;
        if (!oauthUrlRef.current) return;

        setStatus('loading');
        setMessage(`${t('accounts.add.tabs.oauth', 'OAuth 授权')}...`);

        try {
          await completeOAuthLogin();
          setStatus('success');
          setMessage(`${t('accounts.add.tabs.oauth', 'OAuth 授权')} ${t('common.success', '成功')}!`);
          setTimeout(() => {
            setIsOpen(false);
            resetState();
          }, 1200);
        } catch (error) {
          setStatus('error');
          const errorMsg = String(error);
          if (errorMsg.includes('Refresh Token') || errorMsg.includes('refresh_token')) {
            setMessage(errorMsg);
          } else if (errorMsg.includes('Tauri') || errorMsg.toLowerCase().includes('environment') || errorMsg.includes('环境')) {
            setMessage(t('common.environment_error', { error: errorMsg }));
          } else {
            setMessage(`${t('accounts.add.tabs.oauth', 'OAuth 授权')} ${t('common.error', '错误')}: ${errorMsg}`);
          }
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [completeOAuthLogin, t]);

  // Pre-generate OAuth URL when dialog opens on OAuth tab
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

  // If user navigates away from OAuth tab, cancel prepared flow
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'oauth') return;
    if (!oauthUrl) return;

    cancelOAuthLogin().catch(() => {});
    setOauthUrl('');
    setOauthUrlCopied(false);
  }, [isOpen, activeTab]);

  const resetState = () => {
    setStatus('idle');
    setMessage('');
    setRefreshToken('');
    setOauthUrl('');
    setOauthUrlCopied(false);
    setShowManual(false);
  };

  const handleAction = async (
    actionName: string,
    actionFn: () => Promise<any>,
    options?: { clearOauthUrl?: boolean }
  ) => {
    setStatus('loading');
    setMessage(`${actionName}...`);
    if (options?.clearOauthUrl !== false) {
      setOauthUrl('');
    }
    try {
      await actionFn();
      setStatus('success');
      setMessage(`${actionName} ${t('common.success', '成功')}!`);

      setTimeout(() => {
        setIsOpen(false);
        resetState();
      }, 1200);
    } catch (error) {
      setStatus('error');
      const errorMsg = String(error);
      if (errorMsg.includes('Refresh Token') || errorMsg.includes('refresh_token')) {
        setMessage(errorMsg);
      } else if (errorMsg.includes('Tauri') || errorMsg.toLowerCase().includes('environment') || errorMsg.includes('环境')) {
        setMessage(t('common.environment_error', { error: errorMsg }));
      } else {
        setMessage(`${actionName} ${t('common.error', '错误')}: ${errorMsg}`);
      }
    }
  };

  const handleSubmit = async () => {
    if (!refreshToken.trim()) {
      setStatus('error');
      setMessage(t('accounts.add.token.error_token', '请填写 Refresh Token'));
      return;
    }

    setStatus('loading');

    let tokens: string[] = [];
    const input = refreshToken.trim();

    try {
      if (input.startsWith('[') && input.endsWith(']')) {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
          tokens = parsed
            .map((item: any) => item.refresh_token)
            .filter((tok: any) => typeof tok === 'string' && tok.startsWith('1//'));
        }
      }
    } catch (e) {
      console.debug('JSON parse fallback to regex', e);
    }

    if (tokens.length === 0) {
      const regex = /1\/\/[a-zA-Z0-9_\-]+/g;
      const matches = input.match(regex);
      if (matches) {
        tokens = matches;
      }
    }

    tokens = [...new Set(tokens)];

    if (tokens.length === 0) {
      setStatus('error');
      setMessage(t('accounts.add.token.error_token', '未找到有效的 Refresh Token'));
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < tokens.length; i++) {
      const currentToken = tokens[i];
      setMessage(t('accounts.add.token.batch_progress', { current: i + 1, total: tokens.length, defaultValue: `正在导入第 ${i + 1}/${tokens.length} 个账号...` }));

      try {
        await onAdd("", currentToken);
        successCount++;
      } catch (error) {
        console.error(`Failed to add token ${i + 1}:`, error);
        failCount++;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    if (successCount === tokens.length) {
      setStatus('success');
      setMessage(t('accounts.add.token.batch_success', { count: successCount, defaultValue: `成功导入 ${successCount} 个账号` }));
      setTimeout(() => {
        setIsOpen(false);
        resetState();
      }, 1200);
    } else if (successCount > 0) {
      setStatus('success');
      setMessage(t('accounts.add.token.batch_partial', { success: successCount, fail: failCount, defaultValue: `部分成功: ${successCount} 成功, ${failCount} 失败` }));
    } else {
      setStatus('error');
      setMessage(t('accounts.add.token.batch_fail', '导入失败，请检查 Token 有效性'));
    }
  };

  const handleOAuth = () => {
    handleAction(t('accounts.add.tabs.oauth', 'OAuth 授权'), startOAuthLogin, { clearOauthUrl: false });
  };

  const handleCancelOAuth = async () => {
    await cancelOAuthLogin().catch(() => {});
    setStatus('idle');
    setMessage('');
  };

  const handleCompleteOAuth = () => {
    handleAction(t('accounts.add.tabs.oauth', 'OAuth 授权'), completeOAuthLogin, { clearOauthUrl: false });
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
    setMessage(t('accounts.add.oauth.manual_submitting', '正在提交认证码...'));

    try {
      await invoke('submit_oauth_code', { code: manualCode.trim(), state: null });
      setStatus('success');
      setMessage(t('accounts.add.oauth.manual_submitted', '认证码已提交，后台处理中...'));
      setManualCode('');
    } catch (error) {
      const errStr = String(error);
      if (errStr.includes("No active OAuth flow")) {
        setMessage(t('accounts.add.oauth.error_no_flow', '请先点击开始授权'));
        setStatus('error');
      } else {
        setMessage(`${t('common.error', '错误')}: ${errStr}`);
        setStatus('error');
      }
    }
  };

  const handleImportDb = () => {
    handleAction(t('accounts.add.import.btn_db', '一键导入'), async () => {
      const accounts = await importFromDb();
      if (Array.isArray(accounts) && accounts.length > 0) {
        setMessage(t('accounts.add.token.batch_success', { count: accounts.length, defaultValue: `成功导入 ${accounts.length} 个账号` }));
      }
      return accounts;
    });
  };

  const handleImportV1 = () => {
    handleAction(t('accounts.add.import.btn_v1', '从 V1 导入'), importV1Accounts);
  };

  const handleImportCustomDb = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'VSCode DB',
            extensions: ['vscdb'],
          },
          {
            name: 'All Files',
            extensions: ['*'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        handleAction(t('accounts.add.import.btn_custom_db', '从自定义 DB 导入'), () => importFromCustomDb(selected));
      }
    } catch (err) {
      console.error('Failed to open dialog:', err);
    }
  };

  const handleClose = async () => {
    if (status === 'loading' && activeTab === 'oauth') {
      await cancelOAuthLogin().catch(() => {});
    }
    setIsOpen(false);
  };

  return (
    <>
      <Button
        variant={buttonVariant}
        size="sm"
        className={cn("gap-2 shadow-sm relative z-10", triggerClass)}
        onClick={() => setIsOpen(true)}
        title={!showText ? t('accounts.add_account', '添加账号') : undefined}
      >
        <Plus className="w-4 h-4" />
        {showText && <span>{t('accounts.add_account', '添加账号')}</span>}
      </Button>

      <Dialog
        open={isOpen}
        onOpenChange={async (open) => {
          if (!open) {
            await handleClose();
          } else {
            setIsOpen(true);
          }
        }}
      >
        <DialogContent className="max-w-md w-full p-5 rounded-3xl shadow-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              <span>{t('accounts.add.title', '添加新账号')}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t('accounts.add.description', '支持 Google OAuth 一键授权、Refresh Token 或本地环境扫描')}
            </DialogDescription>
          </DialogHeader>

          {/* Tab 导航 */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full mt-1">
            <TabsList className="grid grid-cols-3 w-full h-10 p-1 rounded-xl bg-muted/70">
              <TabsTrigger
                value="oauth"
                className="rounded-lg text-xs font-semibold gap-1.5 py-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span>{t('accounts.add.tabs.oauth', 'OAuth 授权')}</span>
              </TabsTrigger>
              <TabsTrigger
                value="token"
                className="rounded-lg text-xs font-semibold gap-1.5 py-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                <KeyRound className="w-3.5 h-3.5 shrink-0" />
                <span>{t('accounts.add.tabs.token', 'Token 导入')}</span>
              </TabsTrigger>
              <TabsTrigger
                value="import"
                className="rounded-lg text-xs font-semibold gap-1.5 py-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                <Database className="w-3.5 h-3.5 shrink-0" />
                <span>{t('accounts.add.tabs.import', '本地扫描')}</span>
              </TabsTrigger>
            </TabsList>

            {/* 状态提示区 */}
            {status !== 'idle' && message && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-2.5 my-3 text-xs font-medium shadow-sm transition-all",
                  status === 'loading' && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                  status === 'success' && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                  status === 'error' && "bg-destructive/10 text-destructive border-destructive/20"
                )}
              >
                {status === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                {status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                {status === 'error' && <XCircle className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate">{message}</span>
              </div>
            )}

            {/* OAuth 授权 */}
            <TabsContent value="oauth" className="space-y-3.5 mt-3">
              <div className="rounded-2xl border bg-card p-4 text-center space-y-3.5 shadow-sm">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Globe className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-foreground">
                    {t('accounts.add.oauth.recommend', 'Google 账号一键授权')}
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-normal max-w-xs mx-auto">
                    {t('accounts.add.oauth.desc', '将打开默认浏览器进行登录授权，自动获取并保存 Token。')}
                  </p>
                </div>

                {status === 'loading' ? (
                  <div className="space-y-2 pt-0.5">
                    <div className="flex items-center justify-center gap-2 rounded-xl bg-blue-500/10 border border-blue-500/20 py-2.5 px-3 text-xs font-medium text-blue-600 dark:text-blue-400">
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      <span>{t('accounts.add.oauth.btn_waiting', '正在等待浏览器授权...')}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={handleCancelOAuth}
                    >
                      {t('accounts.add.oauth.btn_cancel_waiting', '取消等待')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full h-10 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center justify-center gap-2"
                    onClick={handleOAuth}
                    disabled={status === 'success'}
                  >
                    <Globe className="h-4 w-4" />
                    <span>{t('accounts.add.oauth.btn_start', '在浏览器中授权登录')}</span>
                  </Button>
                )}
              </div>

              {/* 手动高级选项（默认折叠） */}
              <div className="rounded-xl border bg-muted/30 p-2.5 space-y-2.5">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowManual((prev) => !prev)}
                >
                  <span className="flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" />
                    <span>{t('accounts.add.oauth.manual_toggle', '遇到跳转问题？展开手动授权')}</span>
                  </span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", showManual && "rotate-180")} />
                </button>

                {showManual && (
                  <div className="pt-2 space-y-2.5 border-t text-left">
                    {oauthUrl && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {t('accounts.add.oauth.link_label', '方式一：手动复制授权链接')}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full justify-between gap-2 border-dashed h-8 px-2 text-xs"
                          onClick={handleCopyUrl}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {oauthUrlCopied ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="font-mono truncate text-[10px] text-muted-foreground">{oauthUrl}</span>
                          </div>
                          <span className="text-[10px] font-semibold shrink-0 text-foreground">
                            {oauthUrlCopied ? t('accounts.add.oauth.copied', '已复制') : t('accounts.add.oauth.copy_link', '复制链接')}
                          </span>
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="w-full h-8 text-xs font-semibold gap-1.5"
                          onClick={handleCompleteOAuth}
                          disabled={status === 'loading' || status === 'success'}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>{t('accounts.add.oauth.btn_finish', '我已在浏览器授权，完成导入')}</span>
                        </Button>
                      </div>
                    )}

                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {t('accounts.add.oauth.manual_hint', '方式二：粘贴回调链接或 Authorization Code')}
                      </span>
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          placeholder={t('accounts.add.oauth.manual_placeholder', '粘贴回调链接或 Code...')}
                          value={manualCode}
                          onChange={(e) => setManualCode(e.target.value)}
                          className="h-8 text-xs rounded-lg"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 shrink-0 px-3 text-xs font-semibold gap-1"
                          onClick={handleManualSubmit}
                          disabled={!manualCode.trim() || status === 'loading'}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          <span>{t('common.submit', '提交')}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Refresh Token */}
            <TabsContent value="token" className="space-y-3 mt-3">
              <div className="rounded-2xl border bg-card p-3.5 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-primary" />
                    <span>{t('accounts.add.token.label', 'Refresh Token')}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
                    支持批量
                  </span>
                </div>
                <Textarea
                  className="h-32 resize-none rounded-xl font-mono text-xs leading-relaxed"
                  placeholder={t(
                    'accounts.add.token.placeholder',
                    '在此处粘贴您的 Refresh Token (支持批量)\n\n支持格式:\n1. 单个 Token (1//...)\n2. JSON 数组 (含 refresh_token 字段)\n3. 任意包含 Token 的文本 (自动提取)'
                  )}
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                  disabled={status === 'loading' || status === 'success'}
                />
                <p className="text-[11px] text-muted-foreground leading-normal">
                  {t('accounts.add.token.hint', '提示: 支持一次性粘贴多个 Token 或 JSON 数组，系统将自动识别并批量导入。')}
                </p>
              </div>
            </TabsContent>

            {/* 从数据库/本地导入 */}
            <TabsContent value="import" className="space-y-2.5 mt-3">
              <div className="rounded-2xl border bg-card p-3.5 space-y-2 shadow-sm">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                    <Database className="h-3.5 w-3.5 text-primary" />
                    <span>{t('accounts.add.import.scheme_a', '方案 A: 自动扫描本地已登录账号')}</span>
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    {t('accounts.add.import.scheme_a_desc', '自动对本地系统 Keyring/Keychain、Antigravity IDE、插件版及 CLI 进行全量扫描并批量导入已登录账号。')}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 justify-center gap-1.5 text-xs font-semibold rounded-lg"
                    onClick={handleImportDb}
                    disabled={status === 'loading' || status === 'success'}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{t('accounts.add.import.btn_db', '一键扫描全量导入')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 justify-center gap-1.5 text-xs font-semibold rounded-lg"
                    onClick={handleImportCustomDb}
                    disabled={status === 'loading' || status === 'success'}
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-primary" />
                    <span>{t('accounts.add.import.btn_custom_db', '选择 state.vscdb')}</span>
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-3.5 space-y-2 shadow-sm">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                    <FileClock className="h-3.5 w-3.5 text-primary" />
                    <span>{t('accounts.add.import.scheme_b', '方案 B: 从 V1 版本备份')}</span>
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    {t('accounts.add.import.scheme_b_desc', '扫描 ~/.antigravity-agent 目录，批量导入旧版本的账号数据。')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 justify-center gap-1.5 text-xs font-semibold rounded-lg"
                  onClick={handleImportV1}
                  disabled={status === 'loading' || status === 'success'}
                >
                  <FileClock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t('accounts.add.import.btn_v1', '从 V1 备份批量导入')}</span>
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="flex-row items-center justify-end gap-2 pt-3 border-t sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg text-xs"
              onClick={handleClose}
              disabled={status === 'success'}
            >
              {t('common.close', '取消')}
            </Button>
            {activeTab === 'token' && (
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleSubmit}
                disabled={!refreshToken.trim() || status === 'loading' || status === 'success'}
              >
                {status === 'loading' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {t('accounts.add.btn_confirm', '确认添加')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AddAccountDialog;
