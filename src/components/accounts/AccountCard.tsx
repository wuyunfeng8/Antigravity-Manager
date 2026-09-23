import { useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Download,
  Fingerprint,
  Info,
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
import { getModelQuotaDisplay } from "../../utils/quotaDisplay";
import { formatTimeRemaining } from "../../utils/format";
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
  onViewDetails: () => void;
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
  onViewDetails,
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
      ["Claude", findQuotaModel(account.quota?.models, "claude")],
      ["Gemini Pro", findQuotaModel(account.quota?.models, "gemini-pro")],
      ["Gemini Flash", findQuotaModel(account.quota?.models, "gemini-flash")],
    ].map(([name, model]) => {
      const typedModel = typeof model === "object" ? model : undefined;
      if (quotaWindow === "weekly") {
        const thirdParty = name === "Claude";
        const bucket = (account.quota?.quota_groups || [])
          .filter((group) => {
            const groupName = group.display_name.toLowerCase();
            const isThirdParty = /claude|3p/.test(groupName) || group.buckets?.some((item) => item.bucket_id.toLowerCase().includes("3p"));
            return thirdParty ? isThirdParty : !isThirdParty;
          })
          .flatMap((group) => group.buckets || [])
          .filter((item) => /week|7d/i.test(`${item.window} ${item.bucket_id}`))
          .sort((a, b) => a.remaining_fraction - b.remaining_fraction)[0];
        if (bucket) {
          return { name: String(name), percentage: Math.round(bucket.remaining_fraction * 100), resetTime: bucket.reset_time };
        }
      }
      const display = getModelQuotaDisplay(typedModel?.name || String(name), typedModel, account.quota?.quota_groups);
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
        "group flex min-h-[250px] flex-col rounded-2xl border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        isCurrent && "border-emerald-500/50 bg-emerald-500/[0.035] ring-1 ring-emerald-500/15",
        isBestStandby && !isCurrent && "border-emerald-500/35",
        risky && "border-amber-500/35 bg-amber-500/[0.04]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Button variant="ghost" className="h-auto min-w-0 justify-start p-0 text-left hover:bg-transparent" onClick={onViewDetails}>
          <span className={cn("mr-3 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black", isCurrent ? "bg-emerald-500 text-white" : "bg-muted text-foreground")}>
            {(account.name || account.email)[0].toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{accountLabel(account)}</span>
            <span className="mt-0.5 block max-w-[180px] truncate text-[11px] font-normal text-muted-foreground">{account.email}</span>
          </span>
        </Button>

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
              <DropdownMenuItem onClick={onViewDetails}><Info className="mr-2 h-4 w-4" />{t('relay.actions.details')}</DropdownMenuItem>
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
        <div className="mt-3 flex gap-2 rounded-xl bg-muted/60 p-2">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveLabel(); if (event.key === "Escape") setEditing(false); }} placeholder={t('relay.actions.label_placeholder')} className="h-8 text-xs" autoFocus />
          <Button size="iconSm" className="h-8 w-8" onClick={saveLabel}><Check className="h-4 w-4" /></Button>
        </div>
      )}

      {risky && (
        <Button variant="ghost" className="mt-3 h-auto w-full justify-between rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-left text-[11px] text-amber-700 hover:bg-amber-500/15 dark:text-amber-300" onClick={onViewError}>
          <span className="truncate">{riskLabel || t('relay.risk')}</span>
          <span className="ml-2 shrink-0 font-semibold">{t('relay.actions.view')}</span>
        </Button>
      )}

      <div className="mt-4 flex-1 space-y-3">
        {quotas.map((quota) => (
          <div key={quota.name}>
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="font-medium text-muted-foreground">{quota.name}</span>
              <div className="flex items-center gap-2">
                {quota.resetTime && <span className="hidden items-center gap-1 text-[9px] text-muted-foreground xl:flex"><Clock3 className="h-3 w-3" />{formatTimeRemaining(quota.resetTime)}</span>}
                <span className="font-mono font-bold">{quota.percentage}%</span>
              </div>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full transition-all duration-500", quotaColor(quota.percentage))} style={{ width: `${quota.percentage}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between border-t pt-3">
        {isCurrent ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><span className="h-2 w-2 rounded-full bg-emerald-500" />{t('relay.actions.current')}</div>
        ) : (
          <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs font-semibold" onClick={() => onSwitch()} disabled={isSwitching || risky}>
            <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isSwitching && "animate-spin")} />
            {isSwitching ? t('relay.actions.switching') : t('relay.actions.switch')}
          </Button>
        )}
        <Button variant="ghost" size="iconSm" className="h-8 w-8 rounded-lg text-muted-foreground" onClick={onRefresh} disabled={isRefreshing || risky} title={t('relay.actions.refresh')}>
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
        </Button>
      </div>
    </article>
  );
}
