"use client";

import type { ReactNode } from "react";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { useNow } from "@/lib/hooks/use-now";
import { cutoffNote, cutoffTime, formatCountdown, nextCutoff } from "@/lib/deliveries/view/cutoff";
import { HoverHint } from "@/components/ds/hover-hint";
import { TimerIcon } from "lucide-react";
import { CardRow } from "./clock-card-row";

// Live clock in the app-settings timezone, so staff in another zone (India) see
// business time. Renders nothing until mounted: server and browser clocks differ,
// so any SSR text would mismatch on hydration.
export function AppClock({
  cutoffHour,
  variant = "pill",
  routeStatus,
}: {
  cutoffHour: number;
  variant?: "pill" | "card";
  /** Server-rendered OptimoRoute line, streamed through Suspense by the layout. */
  routeStatus?: ReactNode;
}) {
  const tz = useTimezone();
  const now = useNow(15_000);

  if (now === null) return null;


  const hint = `Canada time (${tz}). ${cutoffNote(cutoffHour)}.`;
  if (variant === "card") {
    const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(now);
    const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(now);
    const zone = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value;
    const left = nextCutoff(now, cutoffHour, tz);
    const soon = left.ms <= 60 * 60_000;
    return (
      <div className="border-border bg-muted/30 grid min-w-0 gap-2.5 rounded-(--ui-radius-card) border p-3">
        <HoverHint text={hint}>
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
              <span role="img" aria-label="Canada time" className="text-sm leading-none">🇨🇦</span>
              <span className="truncate">{day}</span>
            </span>
            <span className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
              {time} <span className="text-muted-foreground text-xs font-normal">{zone}</span>
            </span>
          </div>
        </HoverHint>
        <CardRow
          icon={TimerIcon}
          label="Cutoff"
          value={`${cutoffTime(cutoffHour)} · in ${formatCountdown(left.ms, true)}`}
          dot={soon ? "warn" : undefined}
          valueClassName={soon ? "text-warning-foreground dark:text-warning" : undefined}
        />
        {routeStatus}
      </div>
    );
  }
  return (
    <HoverHint text={hint}>
      <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
        {new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(now)}
        <span aria-hidden>·</span>
        <span>Cutoff {cutoffTime(cutoffHour)}</span>
      </span>
    </HoverHint>
  );
}
