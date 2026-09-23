import type { ReactElement, ReactNode } from "react";
import { Info } from "lucide-react";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { cn } from "../../utils/cn";

interface HelpTooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
}

export function HelpTooltip({ content, children, side = "top" }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-60 leading-relaxed">{content}</TooltipContent>
    </Tooltip>
  );
}

interface InfoTooltipProps {
  label: string;
  content: ReactNode;
}

export function InfoTooltip({ label, content }: InfoTooltipProps) {
  return (
    <HelpTooltip content={content}>
      <Button type="button" variant="ghost" size="iconSm"
        className="ml-1 h-5 w-5 rounded-full text-muted-foreground/70 hover:text-foreground"
        aria-label={label}>
        <Info className="h-3.5 w-3.5" />
      </Button>
    </HelpTooltip>
  );
}

interface DisabledReasonTooltipProps {
  reason: string;
  children: ReactElement;
  className?: string;
}

/** Disabled buttons cannot receive pointer or keyboard events, so focus the wrapper instead. */
export function DisabledReasonTooltip({ reason, children, className }: DisabledReasonTooltipProps) {
  return (
    <HelpTooltip content={reason}>
      <span tabIndex={0} aria-label={reason} className={cn("inline-flex", className)}>
        {children}
      </span>
    </HelpTooltip>
  );
}
