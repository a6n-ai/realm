"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { ClockIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";

const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function CutoffBanner({
  days,
  now: injectedNow,
  // "days" means different things at each call site: the full week's dates on the /me/meals
  // grid, or a single day's cutoff on the /me/deliveries day-detail panel. When every entry is
  // past cutoff there's nothing left to count down to, so the fallback copy must match which
  // one was actually passed in — "this week's meals" is wrong when `days` only ever held one day.
  lockedLabel = "This week's meals are locked.",
}: {
  days: { dateIso: string; dayOfWeek: string; lockMs: number }[];
  now?: number;
  lockedLabel?: string;
}) {
  const reduce = useReducedMotion();
  // Lazy initialiser: the clock is read once at mount, not on every render.
  const [now, setNow] = useState(() => injectedNow ?? Date.now());

  useEffect(() => {
    if (injectedNow != null) return; // test-injected clock is fixed
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [injectedNow]);

  const next = days.filter((d) => now < d.lockMs).sort((a, b) => a.lockMs - b.lockMs)[0];

  if (!next) {
    return (
      <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm">
        <ClockIcon className="size-4 shrink-0" aria-hidden />
        {lockedLabel}
      </div>
    );
  }

  const remaining = next.lockMs - now;
  const soon = remaining < 3600_000; // < 1h → emphasize
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium",
        soon ? "bg-warn/15 text-warn" : "bg-primary/10 text-primary",
        soon && !reduce && "animate-pulse",
      )}
      role="status"
    >
      <ClockIcon className="size-4 shrink-0" aria-hidden />
      {/* The server and the browser read Date.now() microseconds-to-seconds apart, so this
          text can legitimately round to a different minute between SSR and hydration —
          expected drift, not a real mismatch. */}
      <span className="tabular-nums" suppressHydrationWarning>
        {fmt(remaining)}
      </span>{" "}
      to change {DAY_LABEL[next.dayOfWeek] ?? next.dayOfWeek}&rsquo;s meals
    </div>
  );
}
