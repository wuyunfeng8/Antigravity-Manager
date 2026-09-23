import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
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
import { Card } from "../ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { Progress } from "../ui/progress";
import { DisabledReasonTooltip, HelpTooltip } from "../ui/help-tooltip";

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

function quotaColor(percentage: number | null) {
  if (percentage === null) return "bg-muted-foreground/30";
  if (percentage <= 20) return "bg-rose-500";
  if (percentage <= 50) return "bg-amber-500";
  return "bg-emerald-500";
}

function quotaTextColor(percentage: number | null) {
  if (percentage === null) return "text-muted-foreground";
  if (percentage <= 20) return "text-rose-600 dark:text-rose-400";
  if (percentage <= 50) return "text-amber-600 dark:text-amber-400";
  return "text-foreground";
}

function tierClass(tier: string) {
  if (tier === "ULTRA") return "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300";
  if (tier === "PRO") return "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  return "border-border bg-muted text-muted-foreground";
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
  const [showResets, setShowResets] = useState(false);
  const tier = getAccountTier(account).toUpperCase();
  const risky = Boolean(account.disabled || account.validation_blocked || account.quota?.is_forbidden);
  const riskLabel = getValidationBlockedStatusLabel(account.validation_blocked_reason, t)
    || account.quota?.forbidden_reason
    || account.disabled_reason;

  useEffect(() => {
    setLabel(account.custom_label || "");
  }, [account.custom_label]);

  const quotas = useMemo(() => {
    const weeklyDataAvailable = account.quota?.quota_groups?.some((group) =>
      group.buckets?.some((bucket) => /week|7d|168h/i.test(`${bucket.window} ${bucket.bucket_id}`)),
    );
    return [
      ["Gemini", findQuotaModel(account.quota?.models, "gemini")],
      ["Claude", findQuotaModel(account.quota?.models, "claude")],
      ["GPT", findQuotaModel(account.quota?.models, "gpt")],
    ].map(([name, model]) => {
      const typedModel = typeof model === "object" ? model : undefined;
      const display = getCategoryQuotaDisplay(String(name), typedModel, account.quota?.quota_groups, quotaWindow);
      return {
        name: String(name),
        percentage: account.quota && (quotaWindow === "5h" || weeklyDataAvailable) && Number.isFinite(display.percentage)
          ? Math.max(0, Math.min(100, display.percentage))
          : null,
        resetTime: display.resetTime,
      };
    });
  }, [account.quota, quotaWindow]);

  const saveLabel = () => {
    onUpdateLabel?.(label.trim());
    setEditing(false);
  };

  const switchButton = !isCurrent ? (
    <Button size="sm" variant="outline"
      className={cn(
        "h-7 rounded-lg px-2 text-[11px] font-semibold shadow-none",
        isBestStandby && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300",
      )}
      onClick={() => onSwitch()} disabled={isSwitching || risky}>
      {isSwitching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
      {isSwitching ? t("relay.actions.switching") : t("relay.actions.switch")}
    </Button>
  ) : null;

  return (
    <Card
      role="article"
      aria-label={account.email}
      className={cn(
        "group flex min-w-0 flex-col rounded-2xl border bg-card px-3.5 py-3 shadow-none transition-colors hover:border-emerald-500/35",
        isCurrent && "border-emerald-500/45",
        isBestStandby && !isCurrent && "border-emerald-500/30",
        risky && "border-amber-500/40",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold text-foreground",
            isCurrent && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
          )}>
            {(account.name || account.email || "?").charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight">{accountLabel(account)}</span>
            <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground" title={account.email}>{account.email}</span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isCurrent && (
            <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300">
              {t("relay.actions.current")}
            </Badge>
          )}
          {isBestStandby && !isCurrent && (
            <Badge variant="outline" className="border-emerald-500/25 bg-emerald-500/5 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300">
              {t("relay.card.recommended")}
            </Badge>
          )}
          {risky && (
            <Badge variant="outline" className="border-amber-500/25 bg-amber-500/10 px-1.5 text-[10px] text-amber-700 dark:text-amber-300">
              {t("relay.risk")}
            </Badge>
          )}
          <Badge variant="outline" className={cn("px-1.5 text-[10px] font-bold", tierClass(tier))}>{tier}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="iconSm" className="ml-0.5 h-7 w-7 rounded-lg text-muted-foreground"
                aria-label={t("relay.actions.more")}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onViewDevice}><Fingerprint className="mr-2 h-4 w-4" />{t("relay.actions.device")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" />{t("relay.actions.label")}</DropdownMenuItem>
              {onWarmup && <DropdownMenuItem onClick={onWarmup}><Sparkles className="mr-2 h-4 w-4" />{t("relay.actions.warmup")}</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={risky || isSwitching} onClick={() => onSwitch("classic")}><RefreshCw className="mr-2 h-4 w-4" />{t("relay.actions.classic")}</DropdownMenuItem>
              <DropdownMenuItem disabled={risky || isSwitching} onClick={() => onSwitch("ide")}><RefreshCw className="mr-2 h-4 w-4" />{t("relay.actions.ide")}</DropdownMenuItem>
              <DropdownMenuItem disabled={risky || isSwitching} onClick={() => onSwitch("agy")}><Terminal className="mr-2 h-4 w-4" />{t("relay.actions.cli")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onExport}><Download className="mr-2 h-4 w-4" />{t("relay.actions.export")}</DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />{t("relay.actions.delete")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex gap-1.5 rounded-lg bg-muted/60 p-1.5">
          <Input value={label} onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") saveLabel(); if (event.key === "Escape") setEditing(false); }}
            placeholder={t("relay.actions.label_placeholder")} className="h-8 text-xs" autoFocus />
          <Button size="iconSm" className="h-8 w-8" onClick={saveLabel} aria-label={t("common.save")}>
            <Check className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {risky && (
        <Button variant="ghost" className="mt-2 h-auto w-full justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-left text-[11px] text-amber-700 hover:bg-amber-500/10 dark:text-amber-300" onClick={onViewError}>
          <span className="min-w-0 truncate">{riskLabel || t("relay.risk")}</span>
          <span className="ml-2 shrink-0 font-semibold">{t("relay.actions.view")}</span>
        </Button>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2.5 pb-2">
        {quotas.map((quota) => (
          <div key={quota.name} className="min-w-0">
            <div className="flex items-baseline justify-between gap-1">
              <span className="truncate text-[11px] font-medium text-muted-foreground">{quota.name}</span>
              <strong className={cn("shrink-0 text-sm font-bold tabular-nums", quotaTextColor(quota.percentage))}>
                {quota.percentage === null ? "—" : `${quota.percentage}%`}
              </strong>
            </div>
            <Progress value={quota.percentage ?? 0} aria-label={quota.percentage === null
              ? t("relay.card.quota_unavailable", { model: quota.name })
              : t("relay.card.quota_label", { model: quota.name, percentage: quota.percentage })}
              className="mt-1.5 h-1 bg-muted" indicatorClassName={quotaColor(quota.percentage)} />
          </div>
        ))}
      </div>

      {showResets && (
        <div className="grid grid-cols-3 gap-2.5 border-t pb-2 pt-2">
          {quotas.map((quota) => (
            <div key={quota.name} className="min-w-0 text-[10px] leading-relaxed text-muted-foreground"
              title={quota.resetTime ? formatDate(quota.resetTime) || undefined : undefined}>
              <span className="block truncate">{quota.name} · {quotaWindow === "weekly" ? t("relay.weekly") : "5H"}</span>
              <span className="block truncate font-semibold text-foreground/80">
                {quota.percentage === null
                  ? t(quotaWindow === "weekly" && account.quota ? "accounts.details.no_weekly_data" : "relay.no_quota")
                  : formatQuotaResetTime(quota.resetTime, quota.percentage, quotaWindow, t)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
          aria-expanded={showResets} onClick={() => setShowResets((value) => !value)}>
          {t(showResets ? "relay.card.hide_resets" : "relay.card.show_resets")}
          <ChevronDown className={cn("h-3 w-3 transition-transform", showResets && "rotate-180")} />
        </Button>
        <div className="flex shrink-0 items-center gap-1">
          {switchButton && (risky
            ? <DisabledReasonTooltip reason={t("tooltips.card_switch_unavailable")}>{switchButton}</DisabledReasonTooltip>
            : switchButton)}
          <HelpTooltip content={t("tooltips.card_refresh")}>
            <Button variant="ghost" size="iconSm" className="h-7 w-7 rounded-lg text-muted-foreground"
              onClick={onRefresh} disabled={isRefreshing} aria-label={t("relay.actions.refresh")}>
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            </Button>
          </HelpTooltip>
        </div>
      </div>
    </Card>
  );
}
