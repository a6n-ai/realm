import { desc, eq, inArray } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import { zonedDateIso } from "@foundry/commons";
import { db } from "@/db/client";
import { cronRuns } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import type { CronJobKey } from "./jobs";

const log = createLogger("cron");

type Summary = Record<string, number | string | null>;

/** What each runnable job does. Both the cron routes and Settings → Run now go through here. */
const RUNNERS: Partial<Record<CronJobKey, () => Promise<Summary>>> = {
  "pull-completions": async () => {
    const { pullCompletions } = await import("@/lib/services/optimoroute/completions");
    const date = zonedDateIso(Date.now(), (await getAppSettings()).timezone);
    const r = await pullCompletions(date, null);
    return {
      date,
      confirmed: r.outcomes.filter((o) => o.action === "confirmed").length,
      notDelivered: r.outcomes.filter((o) => o.action === "skipped").length,
      awaiting: r.pendingCount,
      unmatched: r.unmatched.length,
      ambiguous: r.ambiguous.length,
    };
  },
  notifications: async () => {
    const { drainPending, materializeDue } = await import("@/lib/notifications/drain");
    const materialized = await materializeDue();
    const processed = await drainPending();
    return { campaignsStarted: materialized, sent: processed };
  },
};

export function isRunnable(job: string): job is CronJobKey {
  return job in RUNNERS;
}

/** Runs a job and records it in cron_runs. Never throws: the result says ok or not. */
export async function runCronJob(job: CronJobKey, trigger: "schedule" | "manual", actorId: bigint | null = null) {
  const runner = RUNNERS[job];
  if (!runner) return { ok: false as const, error: `${job} can't be run here` };
  const [row] = await db.insert(cronRuns).values({ job, trigger, startedAt: Date.now(), createdBy: actorId }).returning({ id: cronRuns.id });
  try {
    const summary = await runner();
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

/** Recent runs per job, newest first. */
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
