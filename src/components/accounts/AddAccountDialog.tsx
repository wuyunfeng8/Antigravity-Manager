import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, Database, FileJson,
  FolderOpen, Globe2, KeyRound, Loader2, Plus, RotateCcw, ShieldCheck, XCircle,
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import type { Account } from '../../types/account';
import type { LocalAccountPreview, LocalImportResult } from '../../services/accountService';
import { useAccountStore } from '../../stores/useAccountStore';
import { copyToClipboard } from '../../utils/clipboard';
import { cn } from '../../utils/cn';
import { extractRefreshTokens } from '../../utils/accountImport';
import { request as invoke } from '../../utils/request';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { DisabledReasonTooltip } from '../ui/help-tooltip';
import { Textarea } from '../ui/textarea';

interface AddAccountDialogProps {
  onAdd: (email: string, refreshToken: string) => Promise<Account>;
  showText?: boolean;
  triggerClass?: string;
  buttonVariant?: 'default' | 'outline' | 'secondary';
}

type Method = 'oauth' | 'local' | 'token' | 'legacy';
type OAuthPhase = 'idle' | 'waiting' | 'processing' | 'success' | 'error';
type Notice = { tone: 'success' | 'error' | 'info'; text: string };
type TokenResult = { index: number; email?: string; failed: boolean };

function AddAccountDialog({
  onAdd,
  showText = true,
  triggerClass,
  buttonVariant = 'outline',
}: AddAccountDialogProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [method, setMethod] = useState<Method>('oauth');
  const [oauthPhase, setOauthPhase] = useState<OAuthPhase>('idle');
  const [oauthUrl, setOauthUrl] = useState('');
  const [oauthEmail, setOauthEmail] = useState('');
  const [oauthError, setOauthError] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previews, setPreviews] = useState<LocalAccountPreview[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scanBusy, setScanBusy] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [localResult, setLocalResult] = useState<LocalImportResult | null>(null);
  const [tokenText, setTokenText] = useState('');
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenProgress, setTokenProgress] = useState({ current: 0, total: 0 });
  const [tokenResults, setTokenResults] = useState<TokenResult[] | null>(null);
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [legacyConfirm, setLegacyConfirm] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const openRef = useRef(false);
  const oauthAttemptRef = useRef(0);
  const oauthPhaseRef = useRef<OAuthPhase>('idle');
  const scanAttemptRef = useRef(0);
  const tokenAttemptRef = useRef(0);
  const failedTokensRef = useRef<Map<number, string>>(new Map());
  const {
    startOAuthLogin, cancelOAuthLogin, scanLocalAccounts,
    importSelectedLocalAccounts, clearLocalAccountScan, importV1Accounts,
  } = useAccountStore();

  useEffect(() => {
    oauthPhaseRef.current = oauthPhase;
  }, [oauthPhase]);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let active = true;
    listen<string>('oauth-url-generated', (event) => {
      if (openRef.current && oauthPhaseRef.current === 'waiting') {
        setOauthUrl(event.payload);
      }
    }).then((unlisten) => {
      if (active) dispose = unlisten;
      else unlisten();
    }).catch(() => {
      // 授权命令本身会返回可见错误；事件监听失败不暴露授权链接。
    });
    return () => {
      active = false;
      dispose?.();
    };
  }, []);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let active = true;
    listen('oauth-browser-open-failed', () => {
      if (openRef.current && oauthPhaseRef.current === 'waiting') {
        setNotice({ tone: 'error', text: t('accounts.add.flow.browser_failed') });
      }
    }).then((unlisten) => {
      if (active) dispose = unlisten;
      else unlisten();
    }).catch(() => {});
    return () => {
      active = false;
      dispose?.();
    };
  }, [t]);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let active = true;
    listen('oauth-callback-received', () => {
      if (openRef.current && oauthPhaseRef.current === 'waiting') {
        oauthPhaseRef.current = 'processing';
        setOauthPhase('processing');
      }
    }).then((unlisten) => {
      if (active) dispose = unlisten;
      else unlisten();
    }).catch(() => {});
    return () => {
      active = false;
      dispose?.();
    };
  }, []);

  const reset = () => {
    setAdvanced(false);
    setMethod('oauth');
    setOauthPhase('idle');
    oauthPhaseRef.current = 'idle';
    setOauthUrl('');
    setOauthEmail('');
    setOauthError('');
    setManualOpen(false);
    setManualCode('');
    setManualBusy(false);
    setCopied(false);
    setPreviews(null);
    setSelectedIds([]);
    setScanBusy(false);
    setLocalBusy(false);
    setLocalResult(null);
    setTokenText('');
    setTokenBusy(false);
    setTokenProgress({ current: 0, total: 0 });
    setTokenResults(null);
    setLegacyBusy(false);
    setLegacyConfirm(false);
    setNotice(null);
    failedTokensRef.current.clear();
  };

  const closeDialog = () => {
    if (oauthPhaseRef.current === 'processing' || localBusy || tokenBusy || legacyBusy) {
      setNotice({ tone: 'info', text: t('accounts.add.flow.finish_processing') });
      return;
    }
    openRef.current = false;
    oauthAttemptRef.current += 1;
    scanAttemptRef.current += 1;
    tokenAttemptRef.current += 1;
    if (oauthPhaseRef.current === 'waiting') {
      void cancelOAuthLogin().catch(() => {});
    }
    void clearLocalAccountScan().catch(() => {});
    setIsOpen(false);
    reset();
  };

  const openDialog = () => {
    reset();
    openRef.current = true;
    setIsOpen(true);
  };

  const cancelOAuth = async () => {
    oauthAttemptRef.current += 1;
    oauthPhaseRef.current = 'idle';
    setOauthPhase('idle');
    setOauthUrl('');
    setManualCode('');
    setManualOpen(false);
    setNotice(null);
    try {
      await cancelOAuthLogin();
    } catch {
      setNotice({ tone: 'error', text: t('accounts.add.flow.cancel_failed') });
    }
  };

  const changeMethod = (next: Method) => {
    if (oauthPhaseRef.current === 'processing' || localBusy || tokenBusy || legacyBusy) {
      setNotice({ tone: 'info', text: t('accounts.add.flow.finish_processing') });
      return;
    }
    if (oauthPhaseRef.current === 'waiting') void cancelOAuth();
    setMethod(next);
    setLegacyConfirm(false);
    setNotice(null);
  };

  const startOAuth = async () => {
    const attempt = ++oauthAttemptRef.current;
    oauthPhaseRef.current = 'waiting';
    setOauthPhase('waiting');
    setOauthError('');
    setOauthUrl('');
    setNotice(null);
    try {
      const account = await startOAuthLogin();
      if (attempt !== oauthAttemptRef.current || !openRef.current) return;
      oauthPhaseRef.current = 'success';
      setOauthEmail(account.email);
      setOauthPhase('success');
    } catch (error) {
      if (attempt !== oauthAttemptRef.current || !openRef.current) return;
      const text = String(error);
      oauthPhaseRef.current = 'error';
      setOauthPhase('error');
      setOauthError(text.includes('Refresh Token') || text.includes('refresh_token')
        ? t('accounts.add.flow.oauth_no_refresh')
        : text.includes('failed_to_open_browser')
          ? t('accounts.add.flow.browser_failed')
          : t('accounts.add.flow.oauth_failed'));
    }
  };

  const submitManualCode = async () => {
    if (!manualCode.trim() || !oauthUrl || manualBusy) return;
    try {
      const expectedState = new URL(oauthUrl).searchParams.get('state');
      if (!expectedState) throw new Error('missing_state');
      if (manualCode.trim().startsWith('http')) {
        const callbackState = new URL(manualCode.trim()).searchParams.get('state');
        if (callbackState !== expectedState) throw new Error('mismatched_state');
      }
      setManualBusy(true);
      setNotice(null);
      await invoke('submit_oauth_code', { code: manualCode.trim(), state: expectedState });
      setManualCode('');
    } catch {
      setNotice({ tone: 'error', text: t('accounts.add.flow.manual_failed') });
    } finally {
      setManualBusy(false);
    }
  };

  const copyOAuthUrl = async () => {
    if (!oauthUrl) return;
    try {
      const succeeded = await copyToClipboard(oauthUrl);
      setCopied(succeeded);
      if (!succeeded) setNotice({ tone: 'error', text: t('accounts.add.flow.copy_failed') });
    } catch {
      setNotice({ tone: 'error', text: t('accounts.add.flow.copy_failed') });
    }
  };

  const scan = async (customDbPath?: string) => {
    const attempt = ++scanAttemptRef.current;
    setScanBusy(true);
    setNotice(null);
    setLocalResult(null);
    setPreviews(null);
    setSelectedIds([]);
    try {
      const found = await scanLocalAccounts(customDbPath);
      if (!openRef.current || attempt !== scanAttemptRef.current) return;
      setPreviews(found);
      setSelectedIds(found.filter((candidate) => candidate.available).map((candidate) => candidate.id));
    } catch {
      if (openRef.current && attempt === scanAttemptRef.current) setNotice({ tone: 'error', text: t('accounts.add.flow.scan_failed') });
    } finally {
      if (attempt === scanAttemptRef.current) setScanBusy(false);
    }
  };

  const importLocal = async () => {
    if (!selectedIds.length || localBusy) return;
    setLocalBusy(true);
    setNotice(null);
    try {
      const result = await importSelectedLocalAccounts(selectedIds);
      if (!openRef.current) return;
      setLocalResult(result);
      setPreviews(null);
      setSelectedIds([]);
      setNotice({
        tone: result.failed.length ? 'info' : 'success',
        text: t('accounts.add.flow.local_summary', {
          imported: result.imported.length,
          failed: result.failed.length,
        }),
      });
    } catch {
      if (openRef.current) setNotice({ tone: 'error', text: t('accounts.add.flow.import_failed') });
    } finally {
      setLocalBusy(false);
    }
  };

  const selectCustomDb = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Antigravity state.vscdb', extensions: ['vscdb'] }],
      });
      if (!selected || typeof selected !== 'string') return;
      changeMethod('local');
      await scan(selected);
    } catch {
      setNotice({ tone: 'error', text: t('accounts.add.flow.file_failed') });
    }
  };

  const chooseJson = async () => {
    try {
      const content = await invoke<string | null>('pick_account_import_json');
      if (content === null) return;
      setTokenText(content);
      setTokenResults(null);
      setNotice({ tone: 'info', text: t('accounts.add.flow.json_loaded') });
    } catch {
      setNotice({ tone: 'error', text: t('accounts.add.flow.file_failed') });
    }
  };

  const importTokens = async (retryOnly = false) => {
    if (tokenBusy) return;
    const attempt = ++tokenAttemptRef.current;
    let duplicates = 0;
    let invalid = 0;
    let items: { index: number; token: string }[];
    if (retryOnly) {
      items = [...failedTokensRef.current].map(([index, token]) => ({ index, token }));
    } else {
      try {
        const parsed = extractRefreshTokens(tokenText);
        if (!parsed.tokens.length) throw new Error('invalid_token');
        duplicates = parsed.duplicates;
        invalid = parsed.invalid;
        items = parsed.tokens.map((token, index) => ({ index: index + 1, token }));
        setNotice(null);
      } catch (error) {
        setNotice({
          tone: 'error',
          text: t(String(error).includes('invalid_json')
            ? 'accounts.add.flow.invalid_json'
            : 'accounts.add.flow.invalid_token'),
        });
        return;
      }
      setTokenResults(null);
      failedTokensRef.current.clear();
      setTokenText('');
    }

    setTokenBusy(true);
    const results: TokenResult[] = retryOnly ? (tokenResults ?? []).filter((row) => !row.failed) : [];
    setTokenProgress({ current: 0, total: items.length });
    for (const [offset, item] of items.entries()) {
      if (!openRef.current || attempt !== tokenAttemptRef.current) break;
      try {
        const account = await onAdd('', item.token);
        results.push({ index: item.index, email: account.email, failed: false });
        failedTokensRef.current.delete(item.index);
      } catch {
        results.push({ index: item.index, failed: true });
        failedTokensRef.current.set(item.index, item.token);
      }
      if (openRef.current && attempt === tokenAttemptRef.current) {
        setTokenProgress({ current: offset + 1, total: items.length });
        setTokenResults([...results].sort((a, b) => a.index - b.index));
      }
    }
    if (attempt === tokenAttemptRef.current) setTokenBusy(false);
    if (openRef.current && attempt === tokenAttemptRef.current) {
      setNotice({
        tone: results.some((row) => row.failed) ? 'info' : 'success',
        text: t('accounts.add.flow.token_summary', {
          imported: results.filter((row) => !row.failed).length,
          failed: results.filter((row) => row.failed).length,
        })
          + (duplicates ? ` ${t('accounts.add.flow.duplicates', { count: duplicates })}` : '')
          + (invalid ? ` ${t('accounts.add.flow.invalid_items', { count: invalid })}` : ''),
      });
    }
  };

  const importLegacy = async () => {
    setLegacyBusy(true);
    setNotice(null);
    try {
      const accounts = await importV1Accounts();
      if (openRef.current) setNotice({ tone: 'success', text: t('accounts.add.flow.legacy_summary', { count: accounts.length }) });
    } catch {
      if (openRef.current) setNotice({ tone: 'error', text: t('accounts.add.flow.legacy_failed') });
    } finally {
      setLegacyConfirm(false);
      setLegacyBusy(false);
    }
  };

  const copyLinkButton = (
    <Button variant="outline" size="sm" disabled={!oauthUrl} onClick={copyOAuthUrl}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? t('accounts.add.flow.copied') : t('accounts.add.flow.copy_link')}
    </Button>
  );

  const importSelectedButton = (
    <Button className="mt-2 w-full bg-emerald-600 text-white hover:bg-emerald-700" disabled={!selectedIds.length || localBusy} onClick={() => void importLocal()}>
      {localBusy && <Loader2 className="h-4 w-4 animate-spin" />}
      {t('accounts.add.flow.import_selected', { count: selectedIds.length })}
    </Button>
  );

  const oauthPanel = (
    <div className="space-y-4">
      {oauthPhase === 'idle' && (
        <Card className="border-emerald-500/20 bg-emerald-500/5 shadow-none">
          <CardContent className="space-y-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <Globe2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">{t('accounts.add.flow.oauth_title')}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('accounts.add.flow.oauth_desc')}</p>
            </div>
            <Button className="h-10 w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={startOAuth}>
              {t('accounts.add.flow.oauth_start')} <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}
      {(oauthPhase === 'waiting' || oauthPhase === 'processing') && (
        <div className="space-y-4">
          <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2 font-semibold"><Loader2 className="h-4 w-4 animate-spin" />{t(oauthPhase === 'waiting' ? 'accounts.add.flow.oauth_waiting' : 'accounts.add.flow.oauth_processing')}</div>
            <p className="mt-2 text-sm text-muted-foreground">{t(oauthPhase === 'waiting' ? 'accounts.add.flow.oauth_waiting_hint' : 'accounts.add.flow.oauth_processing_hint')}</p>
          </div>
          {oauthPhase === 'waiting' && <div className="flex flex-wrap gap-2">
            {oauthUrl ? copyLinkButton : (
              <DisabledReasonTooltip reason={t('tooltips.oauth_link_pending')}>
                {copyLinkButton}
              </DisabledReasonTooltip>
            )}
            <Button variant="ghost" size="sm" onClick={() => setManualOpen((value) => !value)}>
              {t('accounts.add.flow.manual_toggle')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void cancelOAuth()}>
              {t('accounts.add.flow.cancel')}
            </Button>
          </div>}
          {oauthPhase === 'waiting' && manualOpen && (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
              <Label htmlFor="oauth-manual-code">{t('accounts.add.flow.manual_label')}</Label>
              <div className="flex gap-2">
                <Input id="oauth-manual-code" value={manualCode} onChange={(event) => setManualCode(event.target.value)}
                  placeholder={t('accounts.add.flow.manual_placeholder')} autoComplete="off" />
                <Button variant="secondary" disabled={!manualCode.trim() || !oauthUrl || manualBusy} onClick={() => void submitManualCode()}>
                  {manualBusy && <Loader2 className="h-4 w-4 animate-spin" />}{t('accounts.add.flow.submit')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('accounts.add.flow.manual_hint')}</p>
            </div>
          )}
        </div>
      )}
      {oauthPhase === 'success' && (
        <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-5">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          <h3 className="mt-3 font-bold">{t('accounts.add.flow.oauth_success')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{oauthEmail}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t('accounts.add.flow.not_switched')}</p>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setOauthPhase('idle'); setOauthEmail(''); }}>{t('accounts.add.flow.add_another')}</Button>
            <Button size="sm" onClick={closeDialog}>{t('accounts.add.flow.done')}</Button>
          </div>
        </div>
      )}
      {oauthPhase === 'error' && (
        <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-5">
          <XCircle className="h-6 w-6 text-destructive" />
          <h3 className="mt-3 font-bold">{t('accounts.add.flow.oauth_error')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{oauthError}</p>
          <Button className="mt-4" size="sm" onClick={startOAuth}><RotateCcw className="h-4 w-4" />{t('accounts.add.flow.retry')}</Button>
        </div>
      )}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{t('accounts.add.flow.not_switched')}
      </p>
    </div>
  );

  const localPanel = (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold">{t('accounts.add.flow.local_title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('accounts.add.flow.local_desc')}</p>
      </div>
      {previews === null && !scanBusy && !localResult && (
        <Card className="border-emerald-500/20 bg-emerald-500/5 shadow-none">
          <CardContent className="space-y-3 p-5">
            <Database className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
            <p className="text-sm text-muted-foreground">{t('accounts.add.flow.local_preview_hint')}</p>
            <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void scan()}>{t('accounts.add.flow.local_scan')}</Button>
          </CardContent>
        </Card>
      )}
      {scanBusy && <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('accounts.add.flow.scanning')}</div>}
      {previews?.length === 0 && (
        <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">{t('accounts.add.flow.local_empty')}</div>
      )}
      {previews && previews.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Badge variant="secondary">{t('accounts.add.flow.found_count', { count: previews.length })}</Badge>
            <Button variant="ghost" size="sm" onClick={() => void scan()} disabled={localBusy}>{t('accounts.add.flow.rescan')}</Button>
          </div>
          {previews.map((candidate) => (
            <Button key={candidate.id} variant="outline" aria-pressed={selectedIds.includes(candidate.id)}
              disabled={!candidate.available || localBusy}
              className={cn('h-auto w-full justify-start whitespace-normal rounded-xl p-3 text-left shadow-none', selectedIds.includes(candidate.id) && 'border-emerald-500 bg-emerald-500/5')}
              onClick={() => setSelectedIds((ids) => ids.includes(candidate.id) ? ids.filter((id) => id !== candidate.id) : [...ids, candidate.id])}>
              <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', selectedIds.includes(candidate.id) && 'border-emerald-600 bg-emerald-600 text-white')}>
                {selectedIds.includes(candidate.id) && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{candidate.email ?? t('accounts.add.flow.unavailable_account')}</span>
                <span className="block text-xs font-normal text-muted-foreground">{t(`accounts.add.flow.source_${candidate.source}`)}</span>
              </span>
              {!candidate.available && <Badge variant="warning">{t('accounts.add.flow.unavailable')}</Badge>}
            </Button>
          ))}
          {importSelectedButton}
        </div>
      )}
      {localResult && (
        <div role="status" className="space-y-2 rounded-xl border p-4">
          {localResult.imported.map((email) => <p key={email} className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{email}</p>)}
          {localResult.failed.map((failure, index) => <p key={index} className="flex items-center gap-2 text-sm"><XCircle className="h-4 w-4 text-destructive" />{t(`accounts.add.flow.source_${failure.source}`)} · {t('accounts.add.flow.local_row_failed')}</p>)}
          <Button variant="outline" size="sm" onClick={() => void scan()}>{t('accounts.add.flow.rescan')}</Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t('accounts.add.flow.scan_security')}</p>
    </div>
  );

  const tokenPanel = (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold">{t('accounts.add.flow.token_title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('accounts.add.flow.token_desc')}</p>
      </div>
      {!tokenResults && !tokenBusy && (
        <>
          <div className="space-y-2">
            <Label htmlFor="account-tokens">{t('accounts.add.flow.token_label')}</Label>
            <Textarea id="account-tokens" value={tokenText} onChange={(event) => setTokenText(event.target.value)}
              className="min-h-32 resize-y font-mono text-xs" autoComplete="off"
              placeholder={t('accounts.add.flow.token_placeholder')} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void chooseJson()}><FileJson className="h-4 w-4" />{t('accounts.add.flow.choose_json')}</Button>
            <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={!tokenText.trim()} onClick={() => void importTokens()}>{t('accounts.add.flow.token_import')}</Button>
          </div>
        </>
      )}
      {tokenBusy && (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('accounts.add.flow.token_progress', tokenProgress)}
        </div>
      )}
      {tokenResults && (
        <div className="space-y-2 rounded-xl border p-4">
          {tokenResults.map((row) => (
            <p key={row.index} className="flex items-center gap-2 text-sm">
              {row.failed ? <XCircle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              {row.failed
                ? t('accounts.add.flow.token_row_failed', { index: row.index })
                : t('accounts.add.flow.token_row_success', { index: row.index, email: row.email })}
            </p>
          ))}
          <div className="flex flex-wrap gap-2 pt-2">
            {tokenResults.some((row) => row.failed) && <Button size="sm" disabled={tokenBusy} onClick={() => void importTokens(true)}>{t('accounts.add.flow.retry_failed')}</Button>}
            <Button variant="outline" size="sm" disabled={tokenBusy} onClick={() => { setTokenResults(null); setNotice(null); failedTokensRef.current.clear(); }}>{t('accounts.add.flow.add_another')}</Button>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t('accounts.add.flow.token_security')}</p>
    </div>
  );

  const legacyPanel = (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold">{t('accounts.add.flow.legacy_title')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('accounts.add.flow.legacy_desc')}</p>
      </div>
      <Card className="shadow-none"><CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 font-semibold"><FolderOpen className="h-4 w-4" />{t('accounts.add.flow.custom_db')}</div>
        <p className="text-xs text-muted-foreground">{t('accounts.add.flow.custom_db_desc')}</p>
        <Button variant="outline" size="sm" onClick={() => void selectCustomDb()}>{t('accounts.add.flow.choose_db')}</Button>
      </CardContent></Card>
      <Card className="shadow-none"><CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 font-semibold"><Database className="h-4 w-4" />{t('accounts.add.flow.v1_backup')}</div>
        <p className="text-xs text-muted-foreground">{t('accounts.add.flow.v1_desc')}</p>
        {!legacyConfirm ? (
          <Button variant="outline" size="sm" disabled={legacyBusy} onClick={() => setLegacyConfirm(true)}>{t('accounts.add.flow.import_v1')}</Button>
        ) : (
          <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold">{t('accounts.add.flow.v1_confirm_title')}</p>
            <p className="text-xs text-muted-foreground">{t('accounts.add.flow.v1_confirm_desc')}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={legacyBusy} onClick={() => setLegacyConfirm(false)}>{t('accounts.add.flow.cancel_action')}</Button>
              <Button size="sm" disabled={legacyBusy} onClick={() => void importLegacy()}>
                {legacyBusy && <Loader2 className="h-4 w-4 animate-spin" />}{t('accounts.add.flow.confirm_import')}
              </Button>
            </div>
          </div>
        )}
      </CardContent></Card>
    </div>
  );

  const methods: { key: Method; label: string; hint: string; icon: typeof Globe2 }[] = [
    { key: 'oauth', label: t('accounts.add.flow.method_oauth'), hint: t('accounts.add.flow.method_oauth_hint'), icon: Globe2 },
    { key: 'local', label: t('accounts.add.flow.method_local'), hint: t('accounts.add.flow.method_local_hint'), icon: Database },
    { key: 'token', label: t('accounts.add.flow.method_token'), hint: t('accounts.add.flow.method_token_hint'), icon: KeyRound },
    { key: 'legacy', label: t('accounts.add.flow.method_legacy'), hint: t('accounts.add.flow.method_legacy_hint'), icon: FolderOpen },
  ];

  return (
    <>
      <Button variant={buttonVariant} size="sm" className={cn('relative z-10 gap-2', triggerClass)} onClick={openDialog}
        title={!showText ? t('accounts.add_account') : undefined} aria-label={!showText ? t('accounts.add_account') : undefined}>
        <Plus className="h-4 w-4" />{showText && t('accounts.add_account')}
      </Button>
      <Dialog open={isOpen} onOpenChange={(open) => { if (open) openDialog(); else closeDialog(); }}>
        <DialogContent className={cn(
          'max-h-[min(88vh,780px)] gap-0 overflow-y-auto rounded-2xl p-0 transition-[max-width] duration-200',
          advanced ? 'max-w-3xl' : 'max-w-md',
        )}>
          <DialogHeader className="border-b px-6 py-5 pr-12 text-left">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
              {advanced ? t('accounts.add.flow.advanced_eyebrow') : t('accounts.add.flow.quick_eyebrow')}
            </div>
            <DialogTitle className="pt-1 text-lg font-bold">{t('accounts.add.title')}</DialogTitle>
            <DialogDescription className="text-xs">
              {advanced ? t('accounts.add.flow.advanced_desc') : t('accounts.add.flow.quick_desc')}
            </DialogDescription>
          </DialogHeader>

          {!advanced ? (
            <div className="space-y-4 p-6">
              {oauthPanel}
              {oauthPhase === 'idle' && (
                <Button variant="outline" className="h-auto w-full justify-between rounded-xl py-3 text-left"
                  onClick={() => { setAdvanced(true); changeMethod('local'); }}>
                  <span>{t('accounts.add.flow.open_advanced')}</span><ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : (
            <div className="grid min-h-[420px] md:grid-cols-[190px_minmax(0,1fr)]">
              <nav aria-label={t('accounts.add.flow.method_nav')} className="flex gap-1 overflow-x-auto border-b bg-muted/30 p-3 md:flex-col md:overflow-visible md:border-b-0 md:border-r">
                {methods.map(({ key, label, hint, icon: Icon }) => (
                  <Button key={key} variant="ghost" aria-pressed={method === key}
                    className={cn('h-auto min-w-fit justify-start rounded-xl px-3 py-2 text-left md:w-full', method === key && 'bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-300')}
                    onClick={() => changeMethod(key)}>
                    <Icon className="h-4 w-4" />
                    <span className="min-w-0"><span className="block text-xs font-semibold">{label}</span><span className="hidden text-[10px] font-normal text-muted-foreground md:block">{hint}</span></span>
                  </Button>
                ))}
                <Button variant="ghost" size="sm" className="min-w-fit justify-start md:mt-auto md:w-full"
                  onClick={() => { if (oauthPhaseRef.current === 'processing' || localBusy || tokenBusy || legacyBusy) { setNotice({ tone: 'info', text: t('accounts.add.flow.finish_processing') }); return; } if (oauthPhaseRef.current === 'waiting') void cancelOAuth(); setAdvanced(false); setMethod('oauth'); setNotice(null); }}>
                  <ArrowLeft className="h-4 w-4" />{t('accounts.add.flow.back_quick')}
                </Button>
              </nav>
              <div className="min-w-0 space-y-4 p-5 md:p-6">
                {method === 'oauth' && oauthPanel}
                {method === 'local' && localPanel}
                {method === 'token' && tokenPanel}
                {method === 'legacy' && legacyPanel}
              </div>
            </div>
          )}
          {notice && (
            <div role={notice.tone === 'error' ? 'alert' : 'status'} className={cn(
              'mx-5 mb-5 rounded-xl border px-4 py-3 text-sm',
              notice.tone === 'error' ? 'border-destructive/25 bg-destructive/5 text-destructive' :
                notice.tone === 'success' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' :
                  'border-blue-500/25 bg-blue-500/5 text-blue-700 dark:text-blue-300',
            )}>{notice.text}</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AddAccountDialog;
