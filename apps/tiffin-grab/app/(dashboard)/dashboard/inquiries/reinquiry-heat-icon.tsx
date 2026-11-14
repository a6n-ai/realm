"use client";

import { FlameIcon, SnowflakeIcon, SunIcon, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";
import { cn } from "@foundry/ui/cn";
import type { ReinquiryHeat } from "@/lib/inquiries/reinquiry-heat";
import type { PipelineRow } from "@/lib/inquiries/inquiries.service";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { formatEpoch } from "@/lib/format/datetime";

const HEAT: Record<ReinquiryHeat, { label: string; icon: LucideIcon; tone: string }> = {
  hot: { label: "Hot", icon: FlameIcon, tone: "text-red-600 dark:text-red-400" },
  warm: { label: "Warm", icon: SunIcon, tone: "text-amber-600 dark:text-amber-400" },
  cold: { label: "Cold", icon: SnowflakeIcon, tone: "text-sky-600 dark:text-sky-400" },
};

/** Marks a lead that came back: hot, warm or cold, with how often, when and through which source on hover. */
export function ReinquiryHeatIcon({ reinquiry }: { reinquiry: PipelineRow["reinquiry"] }) {
  const timeZone = useTimezone();
  if (!reinquiry) return null;
  const { label, icon: Icon, tone } = HEAT[reinquiry.heat];
  const times = reinquiry.count === 1 ? "once" : `${reinquiry.count} times`;
  const text = `${label} re-inquiry: came back ${times}, last on ${formatEpoch(reinquiry.lastAt, { mode: "date", timeZone })}${reinquiry.sourceLabel ? ` via ${reinquiry.sourceLabel}` : ""}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0 items-center" aria-label={text} role="img">
          <Icon className={cn("size-4", tone)} aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
