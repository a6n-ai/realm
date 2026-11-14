// The Inquiries Renewals view's recommendations: which open plans staff should act on next, in one ranking.
import type { Visible } from "@/lib/tenant/org-scope";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSizes, orders, plans, users } from "@/db/schema";
import { lastTiffinSql } from "@/lib/orders/queries";
import { addDaysIso } from "@foundry/commons/util/dates";
import { OPEN_TRACKS, type RenewalsFilter } from "@/lib/renewals/filters";
import { followUpWhere, computedStatusSql, trackInquiry } from "./renewal-tracking.service";
import { hydrateRenewalRows, renewalSelect, renewalsWhere, type DayBounds, type RenewalRow } from "./renewals.service";
import type { RenewalRange } from "./filters";

export type RenewalReason = "overdue" | "due" | "renew";
export type NextRenewalRow = RenewalRow & { reason: RenewalReason };
/** `owner`: the plan's current owner publicId, UNASSIGNED_OWNER, or null for every owner. */
export type RenewalQueueScope = { visible: Visible; owner: string | null };

const NO_REASON = 4;
const REASON_BY_RANK: Record<number, RenewalReason> = { 0: "overdue", 1: "due", 2: "renew", 3: "renew" };
const NO_RANGE: RenewalRange = { by: "last", fromIso: null, toIso: null, fromMs: null, toMs: null };

const isEmptyScope = (scope: RenewalQueueScope) => scope.visible !== "all" && scope.visible.length === 0;

function queueFilter(scope: RenewalQueueScope): RenewalsFilter {
  return {
    tab: "renewals", type: null, track: OPEN_TRACKS, followUp: null, dateBy: "last", ending: null, ended: null,
    status: null, renewed: null, owner: scope.owner, renewWindow: false, from: null, to: null, q: "",
  };
}

/**
 * The one ranking. The plan's renewal status and last tiffin are subqueries over its later orders and deliveries, so
 * they are computed once per plan in `facts` and the ranking reads the columns; inlining them into every branch made
 * a 1 MB query that took 30-60 s in prod. Lower rank first, then the signal (oldest follow-up, or soonest last
 * tiffin), then order id. Upcoming follow-ups are never in the queue.
 */
function rankedIds(scope: RenewalQueueScope, today: string, day: DayBounds, limit: number) {
  const facts = db.$with("facts").as(
    db
      .select({
        id: orders.id,
        running: sql<boolean>`${orders.status} in ('active', 'paused')`.as("running"),
        status: sql<string>`${computedStatusSql}`.as("status"),
        last: sql<string | null>`${lastTiffinSql}`.as("last"),
        followUpAt: sql<number | null>`${trackInquiry.followUpAt}`.as("follow_up_at"),
        overdue: sql<boolean>`coalesce(${followUpWhere("overdue", day.dayStart, day.dayEnd)}, false)`.as("overdue"),
        due: sql<boolean>`coalesce(${followUpWhere("due", day.dayStart, day.dayEnd)}, false)`.as("due"),
        upcoming: sql<boolean>`coalesce(${followUpWhere("upcoming", day.dayStart, day.dayEnd)}, false)`.as("upcoming"),
      })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.id))
      .leftJoinLateral(trackInquiry, sql`true`)
      .where(renewalsWhere(scope.visible, queueFilter(scope), today, NO_RANGE, day) ?? sql`true`),
  );
  // Same window as renewWindowWhere in renewals.service: nothing booked after, and ending within 7 days (running)
  // or lapsed within 14 (the shared filter already keeps only running or completed plans).
  const window = sql`${facts.status} = 'none' and (
    (${facts.running} and ${facts.last} between ${today} and ${addDaysIso(today, 7)})
    or ${facts.last} between ${addDaysIso(today, -14)} and ${addDaysIso(today, -1)})`;
  const rank = sql<number>`(case
    when ${facts.overdue} then 0
    when ${facts.due} then 1
    when ${window} and ${facts.last} >= ${today} then 2
    when ${window} and ${facts.last} < ${today} then 3
    else ${sql.raw(String(NO_REASON))} end)`;
  const signal = sql`cast(coalesce(case
    when ${facts.overdue} or ${facts.due} then ${facts.followUpAt}
    else extract(epoch from cast(${facts.last} as date)) * 1000 end, 0) as double precision)`;
  const ranked = db.$with("ranked").as(
    db.with(facts).select({ id: facts.id, rank: sql<number>`${rank}`.as("rank"), signal: sql<number>`${signal}`.as("signal") }).from(facts).where(sql`not ${facts.upcoming}`),
  );
  return db
    .with(ranked)
    .select({ id: ranked.id, rank: ranked.rank, total: sql<number>`cast(count(*) over() as int)` })
    .from(ranked)
    .where(sql`${ranked.rank} < ${sql.raw(String(NO_REASON))}`)
    .orderBy(asc(ranked.rank), asc(ranked.signal), asc(ranked.id))
    .limit(limit);
}

/** The `limit` plans to act on first, and how many plans there are in all (a window count). */
export async function recommendedRenewals(
  scope: RenewalQueueScope,
  today: string,
  day: DayBounds,
  limit: number,
): Promise<{ rows: NextRenewalRow[]; total: number }> {
  if (isEmptyScope(scope)) return { rows: [], total: 0 };
  const picked = await rankedIds(scope, today, day, limit);
  if (!picked.length) return { rows: [], total: 0 };
  const found = await db
    .select({ ...renewalSelect, status: computedStatusSql })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .leftJoinLateral(trackInquiry, sql`true`)
    .where(inArray(orders.id, picked.map((p) => p.id)));
  const byId = new Map(found.map((r) => [String(r.id), r]));
  const inOrder = picked.flatMap((p) => {
    const row = byId.get(String(p.id));
    return row ? [{ row, rank: Number(p.rank) }] : [];
  });
  const hydrated = await hydrateRenewalRows(inOrder.map((x) => x.row));
  return {
    rows: hydrated.map((row, i) => ({ ...row, reason: REASON_BY_RANK[inOrder[i].rank] })),
    total: picked[0].total,
  };
}
