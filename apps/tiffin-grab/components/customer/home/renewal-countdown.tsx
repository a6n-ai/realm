"use client";

import { cn } from "@foundry/ui/cn";

// Reuses the app's existing ok(green)/warn(orange) status-semantic tokens — the same pair
// every other status pill in the app already uses (see TONE_CLASS in
// app/(customer)/me/deliveries/calendar-constants.ts) — rather than inventing a third color
// pairing just for this badge.
export function RenewalCountdown({ daysLeft }: { daysLeft: number }) {
  const urgent = daysLeft <= 3;
  const critical = daysLeft <= 1;
  const label = daysLeft <= 0 ? "Renew now" : daysLeft === 1 ? "1 day to renew" : `${daysLeft} days to renew`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-300",
        urgent ? "bg-warn/15 text-warn border-warn/30" : "bg-ok/15 text-ok border-ok/30",
        critical && "motion-safe:animate-pulse",
      )}
    >
      <span className={cn("size-1.5 rounded-full", urgent ? "bg-warn" : "bg-ok")} aria-hidden />
      {label}
    </span>
  );
}
