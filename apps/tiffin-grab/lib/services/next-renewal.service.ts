// The Inquiries Renewals view's "Next renewal" card: which open plan staff should act on next, in one ranking.
import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSizes, orders, plans, users, renewals as renewalRecords } from "@/db/schema";
import { lastTiffinSql } from "@/lib/orders/queries";
import { OPEN_TRACKS, type RenewalsFilter } from "@/lib/renewals/filters";
import { followUpWhere, computedStatusSql } from "./renewal-tracking.service";
import { hydrateRenewalRows, renewalSelect, renewalsWhere, type DayBounds, type RenewalRange, type RenewalRow } from "./renewals.service";

export type RenewalReason = "overdue" | "due" | "renew";
export type NextRenewalRow = RenewalRow & { reason: RenewalReason };
/** `owner`: the plan's current owner publicId, UNASSIGNED_OWNER, or null for every owner. */
export type RenewalQueueScope = { visible: "all" | string[]; owner: string | null };

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
    { when: when({ followUp: "overdue" }), rank: 0, signal: renewalRecords.nextFollowUpAt },
    { when: when({ followUp: "due" }), rank: 1, signal: renewalRecords.nextFollowUpAt },
    { when: sql`${when({ renewWindow: true })} and ${lastTiffinSql} >= ${today}`, rank: 2, signal: lastDate },
    { when: sql`${when({ renewWindow: true })} and ${lastTiffinSql} < ${today}`, rank: 3, signal: lastDate },
  ];
  const rank = sql`(case ${sql.join(branches.map((b) => sql`when ${b.when} then ${sql.raw(String(b.rank))}`), sql` `)} else ${sql.raw(String(NO_REASON))} end)`;
  const signal = sql`cast(coalesce(case ${sql.join(branches.map((b) => sql`when ${b.when} then ${b.signal}`), sql` `)} end, 0) as double precision)`;
  const base = when({});
  const eligible = sql`(${base}) and not coalesce(${followUpWhere("upcoming", day.dayStart, day.dayEnd)}, false) and ${rank} < ${sql.raw(String(NO_REASON))}`;
  return { rank, signal, eligible, order: [rank, signal, orders.id] as const };
}
type Ranked = ReturnType<typeof ranked>;
type Position = { rank: number; signal: number; id: bigint };

async function position(r: Ranked, publicId: string): Promise<Position | null> {
  const [row] = await db
    .select({ rank: sql<number>`${r.rank}`, signal: sql<number>`${r.signal}`, id: orders.id })
    .from(orders)
    .leftJoin(renewalRecords, eq(renewalRecords.orderId, orders.id))
    .where(eq(orders.publicId, publicId));
  return row ?? null;
}

/** Rows strictly after (`>`) or before (`<`) a position in the ranking. */
const beyond = (r: Ranked, at: Position, op: ">" | "<") =>
  sql`(${r.rank}, ${r.signal}, ${orders.id}) ${sql.raw(op)} (${at.rank}::int, ${at.signal}::double precision, ${String(at.id)}::bigint)`;

async function pick(r: Ranked, cursor: SQL | undefined, dir: "asc" | "desc", limit: number): Promise<NextRenewalRow[]> {
  const rows = await db
    .select({ ...renewalSelect, status: computedStatusSql, rank: sql<number>`${r.rank}` })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .leftJoin(renewalRecords, eq(renewalRecords.orderId, orders.id))
    .where(and(r.eligible, cursor))
    .orderBy(...r.order.map((p) => sql`${p} ${sql.raw(dir)}`))
    .limit(limit);
  const hydrated = await hydrateRenewalRows(rows.map(({ rank: _rank, ...row }) => row));
  return hydrated.map((row, i) => ({ ...row, reason: REASON_BY_RANK[rows[i].rank] }));
}

/** The plan the card recommends, or the one after/before `cursor` in that order (wrapping round). */
export async function nextRenewal(
  scope: RenewalQueueScope,
  today: string,
  day: DayBounds,
  cursor?: { publicId: string; dir: "next" | "prev" },
): Promise<NextRenewalRow | null> {
  if (isEmptyScope(scope)) return null;
  const r = ranked(scope, today, day);
  const at = cursor ? await position(r, cursor.publicId) : null;
  if (!cursor || !at) return (await pick(r, undefined, "asc", 1))[0] ?? null;
  const asc = cursor.dir !== "prev";
  const others = sql`${orders.publicId} <> ${cursor.publicId}`;
  const [after] = await pick(r, and(others, beyond(r, at, asc ? ">" : "<")), asc ? "asc" : "desc", 1);
  if (after) return after;
  const [wrapped] = await pick(r, others, asc ? "asc" : "desc", 1);
  return wrapped ?? null;
}

/** One plan from the queue by its publicId, or null when it has no reason (or is out of scope). */
export async function queuedRenewal(scope: RenewalQueueScope, today: string, day: DayBounds, publicId: string): Promise<NextRenewalRow | null> {
  if (isEmptyScope(scope)) return null;
  const r = ranked(scope, today, day);
  const [row] = await pick(r, eq(orders.publicId, publicId), "asc", 1);
  return row ?? null;
}

/** The `limit` plans after `afterPublicId` in nextRenewal's order, wrapping to the top at the end. Never repeats it. */
export async function upNextRenewals(scope: RenewalQueueScope, today: string, day: DayBounds, afterPublicId: string, limit: number): Promise<NextRenewalRow[]> {
  if (isEmptyScope(scope)) return [];
  const r = ranked(scope, today, day);
  const at = await position(r, afterPublicId);
  if (!at) return [];
  const after = await pick(r, beyond(r, at, ">"), "asc", limit);
  if (after.length >= limit) return after;
  const before = await pick(r, beyond(r, at, "<"), "asc", limit - after.length);
  return [...after, ...before];
}

/** How many plans in the scope have any reason to act. */
export async function renewalQueueCount(scope: RenewalQueueScope, today: string, day: DayBounds): Promise<number> {
  if (isEmptyScope(scope)) return 0;
  const { eligible } = ranked(scope, today, day);
  const [row] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .leftJoin(renewalRecords, eq(renewalRecords.orderId, orders.id))
    .where(eligible);
  return row?.count ?? 0;
}
