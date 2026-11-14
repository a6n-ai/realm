// The Inquiries Renewals view's recommendations: which open plans staff should act on next, in one ranking.
import type { Visible } from "@/lib/tenant/org-scope";
import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSizes, orders, plans, users } from "@/db/schema";
import { lastTiffinSql } from "@/lib/orders/queries";
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

function queueFilter(scope: RenewalQueueScope, f: Partial<RenewalsFilter>): RenewalsFilter {
  return {
    tab: "renewals", type: null, track: OPEN_TRACKS, followUp: null, dateBy: "last", ending: null, ended: null,
    status: null, renewed: null, owner: scope.owner, renewWindow: false, from: null, to: null, q: "", ...f,
  };
}

/**
 * The one ranking, shared by every query here so the card and its cycle cannot diverge. Lower rank first, then the
 * signal (oldest follow-up, or soonest last tiffin), then order id. Upcoming follow-ups are never in the queue.
 */
function ranked(scope: RenewalQueueScope, today: string, day: DayBounds) {
  const when = (f: Partial<RenewalsFilter>): SQL => renewalsWhere(scope.visible, queueFilter(scope, f), today, NO_RANGE, day) ?? sql`true`;
  const lastDate = sql`(extract(epoch from cast(${lastTiffinSql} as date)) * 1000)`;
  const branches = [
    { when: when({ followUp: "overdue" }), rank: 0, signal: trackInquiry.followUpAt },
    { when: when({ followUp: "due" }), rank: 1, signal: trackInquiry.followUpAt },
    { when: sql`${when({ renewWindow: true })} and ${lastTiffinSql} >= ${today}`, rank: 2, signal: lastDate },
    { when: sql`${when({ renewWindow: true })} and ${lastTiffinSql} < ${today}`, rank: 3, signal: lastDate },
  ];
  const rank = sql`(case ${sql.join(branches.map((b) => sql`when ${b.when} then ${sql.raw(String(b.rank))}`), sql` `)} else ${sql.raw(String(NO_REASON))} end)`;
  const signal = sql`cast(coalesce(case ${sql.join(branches.map((b) => sql`when ${b.when} then ${b.signal}`), sql` `)} end, 0) as double precision)`;
  const base = when({});
  const eligible = sql`(${base}) and not coalesce(${followUpWhere("upcoming", day.dayStart, day.dayEnd)}, false) and ${rank} < ${sql.raw(String(NO_REASON))}`;
  return { rank, signal, eligible, order: [rank, signal, orders.id] as const };
}

/** The `limit` plans to act on first, and how many plans there are in all (a window count, so one query). */
export async function recommendedRenewals(
  scope: RenewalQueueScope,
  today: string,
  day: DayBounds,
  limit: number,
): Promise<{ rows: NextRenewalRow[]; total: number }> {
  if (isEmptyScope(scope)) return { rows: [], total: 0 };
  const r = ranked(scope, today, day);
  const picked = await db
    .select({ ...renewalSelect, status: computedStatusSql, rank: sql<number>`${r.rank}`, total: sql<number>`cast(count(*) over() as int)` })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .leftJoinLateral(trackInquiry, sql`true`)
    .where(r.eligible)
    .orderBy(...r.order.map((p) => sql`${p} asc`))
    .limit(limit);
  const hydrated = await hydrateRenewalRows(picked.map(({ rank: _rank, total: _total, ...row }) => row));
  return {
    rows: hydrated.map((row, i) => ({ ...row, reason: REASON_BY_RANK[picked[i].rank] })),
    total: picked[0]?.total ?? 0,
  };
}
