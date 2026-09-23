import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, RadioTower, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { join } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";

import AccountCard from "../components/accounts/AccountCard";
import AccountDetailsDialog from "../components/accounts/AccountDetailsDialog";
import AccountErrorDialog from "../components/accounts/AccountErrorDialog";
import AddAccountDialog from "../components/accounts/AddAccountDialog";
import DeviceFingerprintDialog from "../components/accounts/DeviceFingerprintDialog";
import ModalDialog from "../components/common/ModalDialog";
import { showToast } from "../components/common/ToastContainer";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { findQuotaModel } from "../config/modelConfig";
import { exportAccounts } from "../services/accountService";
import { useAccountStore } from "../stores/useAccountStore";
import { useConfigStore } from "../stores/useConfigStore";
import { Account, getAccountTier } from "../types/account";
import { cn } from "../utils/cn";
import { getModelQuotaDisplay } from "../utils/quotaDisplay";
import { request as invoke } from "../utils/request";

type Filter = "all" | "ready" | "risk";
type QuotaWindow = "5h" | "weekly";

function accountName(account: Account): string {
  return account.custom_label || account.name || account.email.split("@")[0];
}

function isRiskAccount(account: Account): boolean {
  return Boolean(account.disabled || account.validation_blocked || account.quota?.is_forbidden);
}

function accountScore(account: Account): number {
  const tier = getAccountTier(account);
  const tierWeight = tier === "ultra" ? 300 : tier === "pro" ? 200 : 100;
  const claude = findQuotaModel(account.quota?.models, "claude")?.percentage ?? 0;
  const pro = findQuotaModel(account.quota?.models, "gemini-pro")?.percentage ?? 0;
  return tierWeight + claude + pro;
}

function quotaValue(account: Account | null, category: "claude" | "gemini-pro" | "gemini-flash", quotaWindow: QuotaWindow) {
  if (!account) return { percentage: 0, resetTime: undefined as string | undefined };
  const model = findQuotaModel(account.quota?.models, category);
  if (quotaWindow === "weekly") {
    const thirdParty = category === "claude";
    const buckets = (account.quota?.quota_groups || [])
      .filter((group) => {
        const name = group.display_name.toLowerCase();
        const isThirdParty = /claude|3p/.test(name) || group.buckets?.some((bucket) => bucket.bucket_id.toLowerCase().includes("3p"));
        return thirdParty ? isThirdParty : !isThirdParty;
      })
      .flatMap((group) => group.buckets || [])
      .filter((bucket) => /week|7d/i.test(`${bucket.window} ${bucket.bucket_id}`));
    const bucket = buckets.sort((a, b) => a.remaining_fraction - b.remaining_fraction)[0];
    if (bucket) return { percentage: Math.round(bucket.remaining_fraction * 100), resetTime: bucket.reset_time };
  }
  const display = getModelQuotaDisplay(model?.name || category, model, account.quota?.quota_groups);
  return { percentage: display.percentage, resetTime: display.resetTime };
}

function HeroQuota({ label, value }: { label: string; value: number }) {
  const color = value <= 20 ? "bg-rose-400" : value <= 50 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
        <span className="truncate">{label}</span>
        <span className="font-semibold text-white">{value}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function Accounts() {
  const { t } = useTranslation();
  const {
    accounts,
    currentAccount,
    fetchAccounts,
    fetchCurrentAccount,
    addAccount,
    deleteAccount,
    switchAccount,
    refreshQuota,
    refreshAllQuotas,
    warmUpAccount,
    updateAccountLabel,
  } = useAccountStore();
  const { config } = useConfigStore();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [quotaWindow, setQuotaWindow] = useState<QuotaWindow>(() => localStorage.getItem("accounts_quota_window") === "weekly" ? "weekly" : "5h");
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [detailsAccount, setDetailsAccount] = useState<Account | null>(null);
  const [deviceAccount, setDeviceAccount] = useState<Account | null>(null);
  const [errorAccount, setErrorAccount] = useState<Account | null>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([fetchAccounts(), fetchCurrentAccount()]);
  }, [fetchAccounts, fetchCurrentAccount]);

  useEffect(() => {
    localStorage.setItem("accounts_quota_window", quotaWindow);
  }, [quotaWindow]);

  const bestStandby = useMemo(() => {
    return accounts
      .filter((account) => account.id !== currentAccount?.id && !isRiskAccount(account))
      .sort((a, b) => accountScore(b) - accountScore(a))[0] || null;
  }, [accounts, currentAccount?.id]);

  const filteredAccounts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesQuery = !normalized || `${account.email} ${account.name || ""} ${account.custom_label || ""}`.toLowerCase().includes(normalized);
      if (!matchesQuery) return false;
      if (filter === "risk") return isRiskAccount(account);
      if (filter === "ready") return account.id !== currentAccount?.id && !isRiskAccount(account);
      return true;
    });
  }, [accounts, currentAccount?.id, filter, query]);

  const riskCount = accounts.filter(isRiskAccount).length;
  const readyCount = accounts.filter((account) => account.id !== currentAccount?.id && !isRiskAccount(account)).length;
  const currentQuotas = {
    claude: quotaValue(currentAccount, "claude", quotaWindow).percentage,
    pro: quotaValue(currentAccount, "gemini-pro", quotaWindow).percentage,
    flash: quotaValue(currentAccount, "gemini-flash", quotaWindow).percentage,
  };

  const handleSwitch = async (account: Account, targetIde?: string) => {
    if (switchingId || isRiskAccount(account)) return;
    setSwitchingId(account.id);
    try {
      await switchAccount(account.id, targetIde);
      await fetchAccounts();
      showToast(t("accounts.toast.switch_success", { defaultValue: `已接力到 ${accountName(account)}` }), "success");
    } catch (error) {
      showToast(`${t("common.error")}: ${error}`, "error");
    } finally {
      setSwitchingId(null);
    }
  };

  const handleRefresh = async (account: Account) => {
    setRefreshingIds((current) => new Set(current).add(account.id));
    try {
      await refreshQuota(account.id);
      if (account.id === currentAccount?.id) await fetchCurrentAccount();
    } catch (error) {
      showToast(`${t("common.error")}: ${error}`, "error");
    } finally {
      setRefreshingIds((current) => {
        const next = new Set(current);
        next.delete(account.id);
        return next;
      });
    }
  };

  const handleRefreshAll = async () => {
    if (refreshingAll || accounts.length === 0) return;
    setRefreshingAll(true);
    try {
      const stats = await refreshAllQuotas();
      await fetchCurrentAccount();
      showToast(t("accounts.toast.refresh_all_success", { defaultValue: `已刷新 ${stats.success}/${stats.total} 个账号` }), stats.failed ? "warning" : "success");
    } catch (error) {
      showToast(`${t("common.error")}: ${error}`, "error");
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleWarmup = async (account: Account) => {
    try {
      const message = await warmUpAccount(account.id);
      showToast(message || t("accounts.warmup_now"), "success");
    } catch (error) {
      showToast(`${t("common.error")}: ${error}`, "error");
    }
  };

  const handleExport = async (account: Account) => {
    try {
      const response = await exportAccounts([account.id]);
      const fileName = `amt_${account.email.replace(/[^a-zA-Z0-9.-]/g, "_")}.json`;
      const path = config?.default_export_path
        ? await join(config.default_export_path, fileName)
        : await save({ defaultPath: fileName, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path) return;
      await invoke("save_text_file", { path, content: JSON.stringify(response.accounts, null, 2) });
      showToast(t("common.saved"), "success");
    } catch (error) {
      showToast(`${t("common.error")}: ${error}`, "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteAccountId) return;
    try {
      await deleteAccount(deleteAccountId);
      showToast(t("accounts.toast.delete_success"), "success");
    } catch (error) {
      showToast(`${t("common.error")}: ${error}`, "error");
    } finally {
      setDeleteAccountId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-5 pb-5 pt-10 sm:px-7 sm:pb-7">
      <header className="mx-auto flex w-full max-w-7xl flex-none items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-emerald-600 dark:text-emerald-400">{t('relay.eyebrow')}</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight">{t('relay.headline')}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{t('relay.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-10 rounded-xl" onClick={handleRefreshAll} disabled={refreshingAll || accounts.length === 0}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshingAll && "animate-spin")} />
            <span className="hidden sm:inline">{t('relay.refresh')}</span>
          </Button>
          <AddAccountDialog onAdd={addAccount} showText triggerClass="h-10 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white hover:bg-slate-800 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400" />
        </div>
      </header>

      <div className="mx-auto mt-5 grid w-full max-w-7xl flex-none gap-4 lg:grid-cols-[1.4fr_.6fr]">
        <Card className="overflow-hidden rounded-3xl border-slate-800 bg-slate-950 text-white shadow-lg">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <Button type="button" variant="ghost" className="h-auto min-w-0 justify-start p-0 text-left text-white hover:bg-transparent hover:text-white" onClick={() => currentAccount && setDetailsAccount(currentAccount)}>
                <div className="text-[10px] font-bold tracking-[0.2em] text-emerald-300">{t('relay.current')}</div>
                <div className="mt-2 truncate text-xl font-bold">{currentAccount ? accountName(currentAccount) : t('relay.unselected')}</div>
                <div className="mt-0.5 truncate text-xs text-slate-400">{currentAccount?.email || t('relay.select_hint')}</div>
              </Button>
              <Badge className="border-0 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/15">
                {currentAccount ? `${getAccountTier(currentAccount).toUpperCase()} · ${t('relay.connected')}` : t('relay.unselected')}
              </Badge>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-4 sm:gap-6">
              <HeroQuota label="Claude" value={currentQuotas.claude} />
              <HeroQuota label="Gemini Pro" value={currentQuotas.pro} />
              <HeroQuota label="Gemini Flash" value={currentQuotas.flash} />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-emerald-500/25 bg-emerald-500/10 shadow-none">
          <CardContent className="flex h-full flex-col justify-between p-5 sm:p-6">
            <div>
              <div className="text-[10px] font-bold tracking-[0.2em] text-emerald-700 dark:text-emerald-300">{t('relay.recommended')}</div>
              <div className="mt-2 truncate text-lg font-bold">{bestStandby ? accountName(bestStandby) : t('relay.none')}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {bestStandby
                  ? `${getAccountTier(bestStandby).toUpperCase()} · Claude ${quotaValue(bestStandby, "claude", quotaWindow).percentage}% · Pro ${quotaValue(bestStandby, "gemini-pro", quotaWindow).percentage}%`
                  : t('relay.none_hint')}
              </div>
            </div>
            <Button className="mt-5 w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" disabled={!bestStandby || switchingId === bestStandby.id} onClick={() => bestStandby && handleSwitch(bestStandby)}>
              <RadioTower className={cn("mr-2 h-4 w-4", bestStandby && switchingId === bestStandby.id && "animate-pulse")} />
              {bestStandby && switchingId === bestStandby.id ? t('relay.relaying') : t('relay.relay_now')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <section className="mx-auto mt-6 flex w-full max-w-7xl min-h-0 flex-1 flex-col">
        <div className="flex flex-none flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold">{t('relay.pool')}</h2>
              <Badge variant="secondary" className="font-mono">{filteredAccounts.length}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('relay.pool_summary', { ready: readyCount, riskText: riskCount > 0 ? t('relay.risk_summary', { count: riskCount }) : '' })}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 w-44 rounded-xl bg-card pl-9 text-xs sm:w-56" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('relay.search')} />
            </div>
            <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
              <TabsList className="h-9 rounded-xl">
                <TabsTrigger className="rounded-lg px-3 text-xs" value="all">{t('relay.all')}</TabsTrigger>
                <TabsTrigger className="rounded-lg px-3 text-xs" value="ready">{t('relay.ready')}</TabsTrigger>
                <TabsTrigger className="rounded-lg px-3 text-xs" value="risk">{t('relay.risk')}</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={quotaWindow} onValueChange={(value) => setQuotaWindow(value as QuotaWindow)}>
              <TabsList className="h-9 rounded-xl">
                <TabsTrigger className="rounded-lg px-3 text-xs" value="5h">5H</TabsTrigger>
                <TabsTrigger className="rounded-lg px-3 text-xs" value="weekly">{t('relay.weekly')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="scrollbar-none mt-4 min-h-0 flex-1 overflow-y-auto pb-2 pr-1">
          {filteredAccounts.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  isCurrent={account.id === currentAccount?.id}
                  isBestStandby={account.id === bestStandby?.id}
                  isRefreshing={refreshingIds.has(account.id)}
                  isSwitching={switchingId === account.id}
                  quotaWindow={quotaWindow}
                  onSwitch={(targetIde) => handleSwitch(account, targetIde)}
                  onRefresh={() => handleRefresh(account)}
                  onViewDetails={() => setDetailsAccount(account)}
                  onViewDevice={() => setDeviceAccount(account)}
                  onViewError={() => setErrorAccount(account)}
                  onWarmup={() => handleWarmup(account)}
                  onUpdateLabel={(label) => updateAccountLabel(account.id, label)}
                  onExport={() => handleExport(account)}
                  onDelete={() => setDeleteAccountId(account.id)}
                />
              ))}
            </div>
          ) : (
            <Card className="flex h-full min-h-48 items-center justify-center rounded-3xl border-dashed bg-card/50">
              <CardContent className="p-8 text-center">
                {filter === "risk" ? <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500" /> : filter === "ready" ? <Users className="mx-auto h-8 w-8 text-muted-foreground" /> : <TriangleAlert className="mx-auto h-8 w-8 text-muted-foreground" />}
                <div className="mt-3 text-sm font-semibold">{filter === "risk" ? t('relay.empty_risk') : t('relay.empty')}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t('relay.empty_hint')}</div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <AccountDetailsDialog account={detailsAccount} onClose={() => setDetailsAccount(null)} />
      <DeviceFingerprintDialog account={deviceAccount} onClose={() => setDeviceAccount(null)} />
      <AccountErrorDialog account={errorAccount} onClose={() => setErrorAccount(null)} />
      <ModalDialog
        isOpen={Boolean(deleteAccountId)}
        title={t("accounts.dialog.delete_title")}
        message={t("accounts.dialog.delete_msg")}
        type="confirm"
        confirmText={t("common.delete")}
        isDestructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteAccountId(null)}
      />
    </div>
  );
}
