import { zonedDateIso } from "@realm/commons";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getOptimoRouteConfig, optimoRouteApiKey } from "./config";
import { pushDay, type PushResult } from "./push";
import { pullRoutes, type PullResult } from "./pull";

export type SyncMode = "push" | "pull" | "both";

export type SyncDay = {
  date: string;
  push?: Pick<PushResult, "pushed" | "failed" | "staleCount">;
  pull?: Pick<PullResult, "matched" | "cleared">;
  error?: string;
};

export type SyncSummary = {
  mode: SyncMode;
  ran: boolean;
  /** Why nothing ran — plugin off, or no key. */
  skipped?: string;
  days: SyncDay[];
};

/** Dates to sync: today + 1..daysAhead, in the app's timezone. */
export function syncDates(todayIso: string, daysAhead: number): string[] {
  const out: string[] = [];
  for (let offset = 1; offset <= daysAhead; offset++) {
    const d = new Date(`${todayIso}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export const MAX_DAYS_AHEAD = 14;

export function clampDays(raw: string | null): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(n, 1), MAX_DAYS_AHEAD);
}

export function parseMode(raw: string | null): SyncMode {
  return raw === "pull" || raw === "both" ? raw : "push";
}

/**
 * The unattended half of the integration. Pushes tomorrow's stops so a dispatcher opens
 * OptimoRoute to a full board, and optionally pulls back whatever has been planned.
 *
 * Deliberately never removes. Deletion takes a stop off a driver's route, and doing that
 * unattended on a schedule — from data that may be mid-edit — is the one operation worth
 * a human confirming. Stale counts are reported instead, so monitoring can surface them.
 */
export async function runScheduledSync(opts: {
  mode?: SyncMode;
  daysAhead?: number;
} = {}): Promise<SyncSummary> {
  const mode = opts.mode ?? "push";
  const daysAhead = opts.daysAhead ?? 1;

  const cfg = await getOptimoRouteConfig();
  if (!cfg.installed) return { mode, ran: false, skipped: "plugin not installed", days: [] };
  if (!optimoRouteApiKey()) return { mode, ran: false, skipped: "OPTIMOROUTE_API_KEY not set", days: [] };

  const { timezone } = await getAppSettings();
  const dates = syncDates(zonedDateIso(Date.now(), timezone), daysAhead);

  const days: SyncDay[] = [];
  for (const date of dates) {
    // Sequential across dates: each date is already concurrency-bounded internally, and
    // OptimoRoute's cap is per account, not per request batch.
    const day: SyncDay = { date };
    try {
      if (mode === "push" || mode === "both") {
        const result = await pushDay(date);
        day.push = { pushed: result.pushed, failed: result.failed, staleCount: result.staleCount };
      }
      if (mode === "pull" || mode === "both") {
        const result = await pullRoutes(date);
        day.pull = { matched: result.matched, cleared: result.cleared };
      }
    } catch (e) {
      // One bad date must not stop the rest — a cron run that half-works and says so beats
      // one that aborts on day 1 of 7.
      day.error = e instanceof Error ? e.message : "Unknown error";
    }
    days.push(day);
  }

  return { mode, ran: true, days };
}
