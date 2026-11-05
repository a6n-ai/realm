import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import { deliveries } from "@/db/schema";
import { acquireLease, readLeaseValue, renewLease, writeLeaseValue } from "@/lib/runtime/lease";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { loadDayDeliveries, type DayDeliveryRow } from "@/lib/services/daily-labels.service";
import { getCompletionDetails, getEvents, OptimoRouteError, type OptimoCompletionDetail, type OptimoEvent } from "./client";
import { applyCompletion, movedSourceIds, tiffinsMoved, type ApplyResult } from "./completions";
import { getOptimoRouteConfig } from "./config";
import { dateTimeFormat } from "@/lib/intl/date-format";

// OptimoRoute has no webhooks. get_events is its cursor feed of driver-app events for live
// routes; polling it gives the same result (the OptimoPoller Durable Object alarm calls pollOnce). The cursor and a single-runner lock
// live in the lease table. Losing the cursor only replays events, and applyCompletion leaves rows that
// are already settled, so a replay changes nothing.

const log = createLogger("optimoroute.events");
const TAG_KEY = "optimo:events:tag";
const LOCK_KEY = "optimo:events:lock";
const OWNER = randomUUID();
const LOCK_MS = 90_000;
const ACTIONABLE = new Set(["success", "failed"]);

export function inWindow(nowMs: number, timezone: string, window: { start: string; end: string }): boolean {
  const hhmm = dateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(nowMs);
  return hhmm >= window.start && hhmm < window.end;
}

/** Only a success=false body (HTTP 200, not retryable) means OptimoRoute rejected the tag. */
export function shouldResetTag(err: unknown): boolean {
  return err instanceof OptimoRouteError && !err.retryable && err.status === 200;
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
  // The driver's last word per order wins; applying an earlier event first would act on a stale row.
  const last = new Map<string, OptimoEvent>();
  for (const e of relevant) if (byPublicId.has(e.orderNo!)) last.set(e.orderNo!, e);
  const ours = [...last.values()];
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
    const rec = completions.get(e.orderId!);
    const completion = {
      ...rec,
      status: rec?.status ?? (e.event as "success" | "failed"),
      endTime: rec?.endTime ?? { unixTimestamp: e.unixTimestamp },
    };
    let result: ApplyResult;
    try {
      result = await deps.apply(row, completion, tiffinsMoved(row, movedIds), null);
    } catch (err) {
      // One poison event must not stop the page, or the cursor never advances and it replays forever.
      log.error({ err, orderNo: e.orderNo }, "applying an OptimoRoute event failed");
      ignored += 1;
      continue;
    }
    if (result.kind === "outcome") applied += 1;
    else ignored += 1;
  }
  return { applied, ignored };
}

/** One poll: lock, window check, drain the feed from the stored tag. */
export async function pollOnce(): Promise<"locked" | "outside" | { applied: number; ignored: number }> {
  // Not released after a poll: the next tick of this process renews its own lease, others wait out the TTL.
  if (!(await acquireLease(LOCK_KEY, OWNER, LOCK_MS)) && !(await renewLease(LOCK_KEY, OWNER, LOCK_MS))) return "locked";

  const [{ timezone }, cfg] = await Promise.all([getAppSettings(), getOptimoRouteConfig()]);
  if (!inWindow(Date.now(), timezone, cfg.eventsWindow)) return "outside";

  let tag = (await readLeaseValue(TAG_KEY)) ?? "";
  const total = { applied: 0, ignored: 0 };
  // ponytail: 10 pages × 500 events per tick; the next tick drains the rest.
  for (let i = 0; i < 10; i++) {
    let page;
    try {
      page = await getEvents(tag);
    } catch (e) {
      if (tag && shouldResetTag(e)) {
        // A tag OptimoRoute no longer knows: start over. Replays are harmless (see top).
        log.warn({ err: e }, "get_events rejected the stored tag; resetting");
        await writeLeaseValue(TAG_KEY, null);
      }
      throw e;
    }
    const r = await handleEvents(page.events);
    total.applied += r.applied;
    total.ignored += r.ignored;
    tag = page.tag;
    await writeLeaseValue(TAG_KEY, tag);
    if (page.remaining <= 0) break;
  }
  return total;
}
