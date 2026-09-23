import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  Clock3,
  Download,
  Fingerprint,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Sparkles,
  Terminal,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { findQuotaModel } from "../../config/modelConfig";
import { Account, getAccountTier } from "../../types/account";
import { cn } from "../../utils/cn";
import { getCategoryQuotaDisplay, formatQuotaResetTime } from "../../utils/quotaDisplay";
import { formatDate } from "../../utils/format";
import { getValidationBlockedStatusLabel } from "./accountValidationStatus";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";

interface AccountCardProps {
  account: Account;
  isCurrent: boolean;
  isBestStandby?: boolean;
  isRefreshing: boolean;
  isSwitching?: boolean;
  quotaWindow?: "5h" | "weekly";
  onSwitch: (targetIde?: string) => void;
  onRefresh: () => void;
  onViewDevice: () => void;
  onViewError: () => void;
  onExport: () => void;
  onDelete: () => void;
  onWarmup?: () => void;
  onUpdateLabel?: (label: string) => void;
}

function accountLabel(account: Account) {
  return account.custom_label || account.name || account.email.split("@")[0];
}

function quotaColor(percentage: number) {
  if (percentage <= 20) return "bg-rose-500";
  if (percentage <= 50) return "bg-amber-500";
  return "bg-emerald-500";
}

function tierClass(tier: string) {
  if (tier === "ULTRA") return "bg-violet-600 text-white";
  if (tier === "PRO") return "bg-blue-600 text-white";
  return "bg-slate-500 text-white";
}

export default function AccountCard({
  account,
  isCurrent,
  isBestStandby = false,
  isRefreshing,
  isSwitching = false,
  quotaWindow = "5h",
  onSwitch,
  onRefresh,
  onViewDevice,
  onViewError,
  onExport,
  onDelete,
  onWarmup,
  onUpdateLabel,
}: AccountCardProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(account.custom_label || "");
  const tier = getAccountTier(account).toUpperCase();
  const risky = Boolean(account.disabled || account.validation_blocked || account.quota?.is_forbidden);
  const riskLabel = getValidationBlockedStatusLabel(account.validation_blocked_reason, t)
    || account.quota?.forbidden_reason
    || account.disabled_reason;

  const quotas = useMemo(() => {
    return [
      ["Gemini", findQuotaModel(account.quota?.models, "gemini")],
      ["Claude", findQuotaModel(account.quota?.models, "claude")],
      ["GPT", findQuotaModel(account.quota?.models, "gpt")],
    ].map(([name, model]) => {
      const typedModel = typeof model === "object" ? model : undefined;
      const display = getCategoryQuotaDisplay(String(name), typedModel, account.quota?.quota_groups, quotaWindow);
      return { name: String(name), percentage: display.percentage, resetTime: display.resetTime };
    });
  }, [account.quota, quotaWindow]);

  const saveLabel = () => {
    onUpdateLabel?.(label.trim());
    setEditing(false);
  };

  return (
    <article
      className={cn(
        "group flex flex-col rounded-2xl border bg-card px-3.5 py-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        isCurrent && "border-emerald-500/50 bg-emerald-500/[0.035] ring-1 ring-emerald-500/15",
        isBestStandby && !isCurrent && "border-emerald-500/35",
        risky && "border-amber-500/35 bg-amber-500/[0.04]",
      )}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center min-w-0">
          <span className={cn("mr-2.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black", isCurrent ? "bg-emerald-500 text-white" : "bg-muted text-foreground")}>
            {(account.name || account.email)[0].toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight">{accountLabel(account)}</span>
            <span className="mt-0.5 block max-w-[180px] truncate text-[11px] font-normal text-muted-foreground leading-tight">{account.email}</span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isBestStandby && !isCurrent && <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[9px] text-emerald-600">推荐</Badge>}
          <Badge className={cn("border-0 px-2 text-[9px] font-black hover:opacity-100", tierClass(tier))}>{tier}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="iconSm" className="h-7 w-7 rounded-lg text-muted-foreground">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">{t('relay.actions.more')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onViewDevice}><Fingerprint className="mr-2 h-4 w-4" />{t('relay.actions.device')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" />{t('relay.actions.label')}</DropdownMenuItem>
              {onWarmup && <DropdownMenuItem onClick={onWarmup}><Sparkles className="mr-2 h-4 w-4" />{t('relay.actions.warmup')}</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onSwitch("classic")}><RefreshCw className="mr-2 h-4 w-4" />{t('relay.actions.classic')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSwitch("ide")}><RefreshCw className="mr-2 h-4 w-4" />{t('relay.actions.ide')}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSwitch("agy")}><Terminal className="mr-2 h-4 w-4" />{t('relay.actions.cli')}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onExport}><Download className="mr-2 h-4 w-4" />{t('relay.actions.export')}</DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />{t('relay.actions.delete')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {editing && (
        <div className="mt-2 flex gap-1.5 rounded-lg bg-muted/60 p-1.5">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveLabel(); if (event.key === "Escape") setEditing(false); }} placeholder={t('relay.actions.label_placeholder')} className="h-7 text-xs" autoFocus />
          <Button size="iconSm" className="h-7 w-7" onClick={saveLabel}><Check className="h-3.5 w-3.5" /></Button>
        </div>
      )}

      {risky && (
        <Button variant="ghost" className="mt-2 h-auto w-full justify-between rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-left text-[11px] text-amber-700 hover:bg-amber-500/15 dark:text-amber-300" onClick={onViewError}>
          <span className="truncate">{riskLabel || t('relay.risk')}</span>
          <span className="ml-2 shrink-0 font-semibold">{t('relay.actions.view')}</span>
        </Button>
      )}

      <div className="mt-2.5 flex-1 space-y-2">
        {quotas.map((quota) => (
          <div key={quota.name} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-[11px] leading-tight">
              <span className="font-medium text-muted-foreground">{quota.name}</span>
              <span className="font-mono font-bold">{quota.percentage}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full transition-all duration-500", quotaColor(quota.percentage))} style={{ width: `${quota.percentage}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] leading-tight text-muted-foreground">
              <span className="flex items-center gap-1 font-mono truncate" title={quota.resetTime ? formatDate(quota.resetTime) || undefined : undefined}>
                <Clock3 className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                <span>
                  {quotaWindow === "weekly"
                    ? t('accounts.details.reset_weekly', '周限重置时间')
                    : t('accounts.details.reset_5h', '5H 重置时间')}:
                </span>
                <span className="font-semibold text-foreground/90">
                  {formatQuotaResetTime(quota.resetTime, quota.percentage, quotaWindow, t)}
                </span>
              </span>
              <span className={cn("text-[9px] font-medium shrink-0 ml-1", quota.percentage === 100 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                {quota.percentage === 100
                  ? t('accounts.details.ample', '额度充沛')
                  : t('accounts.details.recovering', '恢复中')}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t pt-2">
        {isCurrent ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><span className="h-2 w-2 rounded-full bg-emerald-500" />{t('relay.actions.current')}</div>
        ) : (
          <Button
            size="sm"
            className={cn(
              "h-7.5 rounded-lg px-2.5 text-xs font-semibold transition-all",
              isBestStandby
                ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                : "border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
            )}
            onClick={() => onSwitch()}
            disabled={isSwitching || risky}
          >
            {isSwitching ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isSwitching ? t('relay.actions.switching') : t('relay.actions.switch')}
          </Button>
        )}
        <Button
          variant="ghost"
          size="iconSm"
          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={onRefresh}
          disabled={isRefreshing || risky}
          title={t('relay.actions.refresh')}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
        </Button>
      </div>
    </article>
  );
}
