import { appTodayIso } from "@/lib/dates/today";
import { DAY_MS } from "@foundry/commons/util/dates";
import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Condition, FilterCondition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { columnResolver, conditionToSql } from "@foundry/database";
import { createLogger } from "@foundry/commons/logger";
import { zonedDateIso } from "@foundry/commons";
import { db } from "@/db/client";
import { cronRuns, users } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import type { SyncMode } from "@/lib/optimoroute/sync";
import { CRON_JOBS, type CronJobKey } from "./jobs";

const log = createLogger("cron");

type Summary = Record<string, number | string | null>;

/** `date` (YYYY-MM-DD) narrows a date-scoped job to that one day; only Run now passes it. */
type RunOptions = RunInput & { actorId: bigint | null };

/** `days` is the cron route's look-ahead (today + 1..days); `date` wins when both are set. */
export type RunInput = { date?: string; mode?: SyncMode; days?: number };

/** What each runnable job does. Both the cron routes and Settings → Run now go through here. */
const RUNNERS: Partial<Record<CronJobKey, (opts: RunOptions) => Promise<Summary>>> = {
  "pull-completions": async ({ date: only, actorId }) => {
    const { pullCompletions } = await import("@/lib/optimoroute/completions");
    // Yesterday too: GitHub's schedule can fire hours late (a 22:00 run landed at 03:56), and
    // past local midnight "today" is the next, still-unrun day. Re-pulling yesterday is a no-op
    // for days already settled — pullCompletions only loads scheduled/skipped rows.
    const { timezone } = await getAppSettings();
    const now = Date.now();
    const dates = only ? [only] : [zonedDateIso(now - DAY_MS, timezone), zonedDateIso(now, timezone)];
    const summary = { dates: dates.join(", "), confirmed: 0, notDelivered: 0, awaiting: 0, unmatched: 0, ambiguous: 0 };
    for (const date of dates) {
      const r = await pullCompletions(date, actorId);
      summary.confirmed += r.outcomes.filter((o) => o.action === "confirmed").length;
      summary.notDelivered += r.outcomes.filter((o) => o.action === "skipped").length;
      summary.awaiting += r.pendingCount;
      summary.unmatched += r.unmatched.length;
      summary.ambiguous += r.ambiguous.length;
    }
    return summary;
  },
  "complete-plans": async () => {
    const { completeFinishedOrders } = await import("@/lib/deliveries/deliveries.service");
    const { lapseAllElapsedPauses } = await import("@/lib/deliveries/pause-days.service");
    // First: a paused day past cutoff is a hold, not live debt or a stranded pause, when plans are judged.
    // The conversion can never stop plans from closing.
    let pauses: Summary = { lapseChecked: 0, lapsed: 0, lapseFailed: 0 };
    try {
      const r = await lapseAllElapsedPauses();
      pauses = { lapseChecked: r.checked, lapsed: r.lapsed, lapseFailed: r.failed };
    } catch (err) {
      log.error({ err }, "lapse elapsed pauses failed");
      pauses = { lapseChecked: 0, lapsed: 0, lapseFailed: "all" };
    }
    return { ...pauses, ...(await completeFinishedOrders()) };
  },
  "optimoroute-sync": async ({ date, mode = "push", days = 1 }): Promise<Summary> => {
    const { runScheduledSync, syncDates } = await import("@/lib/optimoroute/sync");
    const { timezone } = await getAppSettings();
    const dates = date ? [date] : syncDates(appTodayIso(timezone), days);
    const r = await runScheduledSync({ mode, dates });
    if (!r.ran) throw new Error(`Not run: ${r.skipped}`);
    const errors = r.days.filter((d) => d.error);
    // One bad date must not hide the rest: fail only when every date failed.
    if (errors.length === r.days.length) throw new Error(errors[0]!.error);
    const total = (pick: (d: (typeof r.days)[number]) => number | undefined) => r.days.reduce((n, d) => n + (pick(d) ?? 0), 0);
    return {
      mode,
      dates: dates.join(", "),
      pushed: total((d) => d.push?.pushed),
      failed: total((d) => d.push?.failed),
      stale: total((d) => d.push?.staleCount),
      matched: total((d) => d.pull?.matched),
      cleared: total((d) => d.pull?.cleared),
      errors: errors.length,
    };
  },
  "renewal-reminders": async () => {
    const { sendRenewalReminders } = await import("@/lib/notifications/renewal-reminder");
    return sendRenewalReminders();
  },
  "campaign-wake": async () => {
    const { runTick } = await import("@/lib/notifications/tick");
    return runTick();
  },
  "site-refresh": async () => {
    const { runSiteRefresh } = await import("@/lib/landing/site-refresh");
    const r = await runSiteRefresh();
    return { revalidated: r.revalidated ? "yes" : "no", followUp: r.followUp ? "yes" : "no", nextAt: r.nextAt };
  },
  "review-nudge": async () => {
    const { runReviewNudges } = await import("@/lib/notifications/review-nudge-job");
    return runReviewNudges();
  },
  "mint-rep-coupons": async () => {
    const { mintRepCoupons } = await import("@/lib/coupons/mint-rep-coupons");
    return { ...(await mintRepCoupons()) };
  },
  notifications: async () => {
    const { drainPending, materializeDue } = await import("@/lib/notifications/drain");
    const materialized = await materializeDue();
    const processed = await drainPending();
    return { campaignsStarted: materialized, sent: processed };
  },
};

export function isRunnable(job: string): job is CronJobKey {
  // review-nudge and mint-rep-coupons run on a schedule only: no Run now.
  return job in RUNNERS && !!CRON_JOBS.find((j) => j.key === job)?.runnable;
}

/** Runs a job and records it in cron_runs. Never throws: the result says ok or not. */
export async function runCronJob(
  job: CronJobKey,
  trigger: "schedule" | "manual",
  actorId: bigint | null = null,
  input: RunInput = {},
) {
  const runner = RUNNERS[job];
  if (!runner) return { ok: false as const, error: `${job} can't be run here` };
  const [row] = await db.insert(cronRuns).values({ job, trigger, startedAt: Date.now(), createdBy: actorId }).returning({ id: cronRuns.id });
  try {
    const summary = await runner({ ...input, actorId });
    await db.update(cronRuns).set({ finishedAt: Date.now(), ok: true, summary }).where(eq(cronRuns.id, row!.id));
    return { ok: true as const, summary };
  } catch (err) {
    log.error({ err, job }, "cron job failed");
    const error = err instanceof Error ? err.message : String(err);
    await db.update(cronRuns).set({ finishedAt: Date.now(), ok: false, error: error.slice(0, 500) }).where(eq(cronRuns.id, row!.id));
    return { ok: false as const, error };
  }
}

export type CronRunRow = typeof cronRuns.$inferSelect;

export async function recentCronRuns(jobs: string[], perJob = 5): Promise<Map<string, CronRunRow[]>> {
  const rows = jobs.length
    ? await db.select().from(cronRuns).where(inArray(cronRuns.job, jobs)).orderBy(desc(cronRuns.startedAt)).limit(jobs.length * 50)
    : [];
  const byJob = new Map<string, CronRunRow[]>();
  for (const r of rows) {
    const list = byJob.get(r.job) ?? [];
    if (list.length < perJob) list.push(r);
    byJob.set(r.job, list);
  }
  return byJob;
}

/** One run as the history table shows it. No bigints: it crosses to a client component. */
export type CronRunListRow = {
  publicId: string;
  trigger: string;
  startedAt: number;
  finishedAt: number | null;
  ok: boolean | null;
  summary: Record<string, number | string | null> | null;
  error: string | null;
  actorName: string | null;
};

function runsResolver() {
  const base = columnResolver({ trigger: cronRuns.trigger, startedAt: cronRuns.startedAt });
  return (f: FilterCondition) => {
    if (f.field === "status") {
      if (f.value === "ok") return eq(cronRuns.ok, true);
      if (f.value === "failed") return eq(cronRuns.ok, false);
      if (f.value === "running") return isNull(cronRuns.finishedAt);
      return undefined;
    }
    return base(f);
  };
}

export async function listCronRunsPage(job: string, condition: Condition | undefined, page: PageRequest): Promise<Page<CronRunListRow>> {
  const where = and(eq(cronRuns.job, job), conditionToSql(condition, runsResolver()));
  const [items, [{ count }]] = await Promise.all([
    db
      .select({
        publicId: cronRuns.publicId,
        trigger: cronRuns.trigger,
        startedAt: cronRuns.startedAt,
        finishedAt: cronRuns.finishedAt,
        ok: cronRuns.ok,
        summary: cronRuns.summary,
        error: cronRuns.error,
        actorName: users.name,
      })
      .from(cronRuns)
      .leftJoin(users, eq(users.id, cronRuns.createdBy))
      .where(where)
      .orderBy(desc(cronRuns.startedAt), desc(cronRuns.id))
      .limit(page.size)
      .offset(pageOffset(page.page, page.size)),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(cronRuns).where(where),
  ]);
  return { items, total: count, page: page.page, size: page.size };
}
