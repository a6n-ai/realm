import { inArray } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import { deliveries } from "@/db/schema";
import { getRedis } from "@/lib/redis";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { publishAnalyticsLive } from "@/lib/realtime/publish-inbox";
import { loadDayDeliveries, type DayDeliveryRow } from "@/lib/services/daily-labels.service";
import { getCompletionDetails, getEvents, type OptimoCompletionDetail, type OptimoEvent } from "./client";
import { applyCompletion, movedSourceIds, tiffinsMoved, type ApplyResult } from "./completions";
import { getOptimoRouteConfig } from "./config";

// OptimoRoute has no webhooks. get_events is its cursor feed of driver-app events for live
// routes; polling it every 30 s gives the same result. The cursor and a single-runner lock
// live in Redis. Losing the cursor only replays events, and applyCompletion leaves rows that
// are already settled, so a replay changes nothing.

const log = createLogger("optimoroute.events");
const TAG_KEY = "optimo:events:tag";
const LOCK_KEY = "optimo:events:lock";
const LOCK_MS = 90_000;
const INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const ACTIONABLE = new Set(["success", "failed"]);

export function inWindow(nowMs: number, timezone: string, window: { start: string; end: string }): boolean {
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(nowMs);
  return hhmm >= window.start && hhmm < window.end;
}

export type HandleDeps = {
  loadRows: (publicIds: string[]) => Promise<DayDeliveryRow[]>;
  completionsFor: (optimoIds: string[]) => Promise<Map<string, OptimoCompletionDetail>>;
  moved: (ids: bigint[]) => Promise<Set<bigint>>;
  apply: (row: DayDeliveryRow, c: OptimoCompletionDetail | undefined, moved: boolean, actorId: bigint | null) => Promise<ApplyResult>;
};

const realDeps: HandleDeps = {
  loadRows: async (publicIds) => {
    if (publicIds.length === 0) return [];
    const dates = await db
      .selectDistinct({ date: deliveries.deliveryDate })
      .from(deliveries)
      .where(inArray(deliveries.publicId, publicIds));
    const wanted = new Set(publicIds);
    const rows: DayDeliveryRow[] = [];
    for (const { date } of dates) {
      for (const r of await loadDayDeliveries(date, ["scheduled", "skipped"])) {
        if (wanted.has(r.delivery.publicId)) rows.push(r);
      }
    }
    return rows;
  },
  completionsFor: getCompletionDetails,
  moved: movedSourceIds,
  apply: applyCompletion,
};

/** Turns a batch of events into delivery changes. Events for orders that aren't ours are ignored. */
export async function handleEvents(events: OptimoEvent[], deps: HandleDeps = realDeps): Promise<{ applied: number; ignored: number }> {
  const relevant = events.filter((e) => ACTIONABLE.has(e.event) && e.orderNo && e.orderId);
  const rows = await deps.loadRows([...new Set(relevant.map((e) => e.orderNo!))]);
  const byPublicId = new Map(rows.map((r) => [r.delivery.publicId, r]));
  const ours = relevant.filter((e) => byPublicId.has(e.orderNo!));
  let ignored = events.length - ours.length;
  if (ours.length === 0) return { applied: 0, ignored };

  const [completions, movedIds] = await Promise.all([
    deps.completionsFor([...new Set(ours.map((e) => e.orderId!))]),
    deps.moved(rows.map((r) => r.delivery.id)),
  ]);

  let applied = 0;
  for (const e of ours) {
    const row = byPublicId.get(e.orderNo!)!;
    // Prefer the completion record (has the note and end time); fall back to the event's own word.
    const completion = completions.get(e.orderId!) ?? { status: e.event as "success" | "failed", endTime: { unixTimestamp: e.unixTimestamp } };
    const result = await deps.apply(row, completion, tiffinsMoved(row, movedIds), null);
    if (result.kind === "outcome") applied += 1;
    else ignored += 1;
  }
  return { applied, ignored };
}

/** One poll: lock, window check, drain the feed from the stored tag. */
export async function pollOnce(): Promise<"locked" | "outside" | { applied: number; ignored: number }> {
  const redis = getRedis();
  const got = await redis.set(LOCK_KEY, String(process.pid), "PX", LOCK_MS, "NX");
  if (got !== "OK" && (await redis.get(LOCK_KEY)) !== String(process.pid)) return "locked";
  await redis.pexpire(LOCK_KEY, LOCK_MS);

  const [{ timezone }, cfg] = await Promise.all([getAppSettings(), getOptimoRouteConfig()]);
  if (!inWindow(Date.now(), timezone, cfg.eventsWindow)) return "outside";

  let tag = (await redis.get(TAG_KEY)) ?? "";
  const total = { applied: 0, ignored: 0 };
  // ponytail: 10 pages × 500 events per tick; the next tick drains the rest.
  for (let i = 0; i < 10; i++) {
    let page;
    try {
      page = await getEvents(tag);
    } catch (e) {
      if (tag) {
        // A tag OptimoRoute no longer knows: start over. Replays are harmless (see top).
        log.warn({ err: e }, "get_events rejected the stored tag; resetting");
        await redis.del(TAG_KEY);
      }
      throw e;
    }
    const r = await handleEvents(page.events);
    total.applied += r.applied;
    total.ignored += r.ignored;
    tag = page.tag;
    await redis.set(TAG_KEY, tag);
    if (page.remaining <= 0) break;
  }
  if (total.applied > 0) publishAnalyticsLive();
  return total;
}

/** Started once per server from instrumentation.ts when OPTIMO_EVENTS=on. */
export function startOptimoEventPoller(): void {
  let delay = INTERVAL_MS;
  const tick = async () => {
    try {
      const r = await pollOnce();
      if (typeof r === "object" && r.applied > 0) log.info(r, "optimoroute events applied");
      delay = INTERVAL_MS;
    } catch (err) {
      log.error({ err }, "optimoroute event poll failed");
      delay = Math.min(delay * 2, MAX_BACKOFF_MS);
    }
    setTimeout(tick, delay).unref?.();
  };
  setTimeout(tick, INTERVAL_MS).unref?.();
  log.info({ intervalMs: INTERVAL_MS }, "optimoroute event poller started");
}
