/* eslint-disable */
"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useChannel } from "@foundry/realtime/client";
import type { RealtimeEvent } from "@foundry/realtime";
import { cn } from "@foundry/ui/cn";
import { ANALYTICS_LIVE } from "@/lib/realtime/inbox";

// Bulk writes (a completions pull, a batch of verifications) ping many times in
// a burst; one refresh after the burst settles is enough.
const DEBOUNCE_MS = 800;
// The SSE bus is per-process, so a write made by another instance never pings
// this stream. A slow sweep keeps an open tab from drifting in that case. Kept
// well above 5 minutes: the database is Neon, which sleeps after 5 idle minutes,
// so a 5-minute sweep on a screen left open kept it awake all day. One web
// container runs today, so pings already cover every write.
const SWEEP_MS = 30 * 60 * 1000;
// setTimeout overflows past ~24.8 days; anything that far out is picked up by the sweep.
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;

/**
 * Keeps an analytics page current without a manual reload:
 * - an `analytics:live` ping (payment, refund, order, delivery confirmation) refreshes it;
 * - `refreshAt` refreshes it when a time-based change is due, e.g. the next delivery
 *   cutoff, after which that day's tiffins count as delivered;
 * - returning to the tab refreshes it, since pings are not replayed.
 *
 * `updatedLabel` is formatted on the server in the business timezone, so the
 * server and browser render the same text.
 */
export function LiveRefresh({ updatedLabel, refreshAt }: { updatedLabel: string; refreshAt?: number | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => startTransition(() => router.refresh()), DEBOUNCE_MS);
  }, [router]);

  const onEvent = useRef((_e: RealtimeEvent) => {});
  onEvent.current = (e: RealtimeEvent) => {
    if (e.type === "message") refresh();
  };
  useChannel(ANALYTICS_LIVE, (e) => onEvent.current(e));

  useEffect(() => {
    if (refreshAt == null) return;
    const wait = refreshAt - Date.now() + 1000;
    if (wait > MAX_TIMER_MS) return;
    const t = setTimeout(refresh, Math.max(0, wait));
    return () => clearTimeout(t);
  }, [refreshAt, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const sweep = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, SWEEP_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(sweep);
      document.removeEventListener("visibilitychange", onVisible);
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [refresh]);

  return (
    <span
      className="text-muted-foreground inline-flex items-center gap-1.5 text-xs tabular-nums"
      aria-live="polite"
    >
      <span className="relative flex size-2">
        <span
          className={cn(
            "absolute inline-flex size-full rounded-full bg-emerald-500 opacity-60",
            !pending && "animate-ping",
          )}
        />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      {pending ? "Updating…" : `Live · updated ${updatedLabel}`}
    </span>
  );
}
