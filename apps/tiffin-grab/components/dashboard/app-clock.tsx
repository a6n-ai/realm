"use client";

import type { ReactNode } from "react";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { useNow } from "@/lib/hooks/use-now";
import { cutoffNote, cutoffTime } from "@/lib/deliveries/view/cutoff";
import { HoverHint } from "@/components/ds/hover-hint";
import { Clock3Icon, TimerIcon } from "lucide-react";
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

  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);

  const hint = `Canada time (${tz}). ${cutoffNote(cutoffHour)}.`;
  if (variant === "card") {
    return (
      <div className="border-border bg-muted/30 grid min-w-0 gap-2 rounded-(--ui-radius-card) border p-3">
        <HoverHint text={hint}>
          <div className="grid min-w-0 gap-1.5">
            <CardRow icon={Clock3Icon} label="Canada time">
              <span className="text-foreground tabular-nums">{label}</span>
            </CardRow>
            <CardRow icon={TimerIcon} label="Order cutoff">
              <span className="tabular-nums">Cutoff {cutoffTime(cutoffHour)}</span>
            </CardRow>
          </div>
        </HoverHint>
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
