import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, like, lte, or, sql } from "drizzle-orm";
import { UNPAID } from "@/lib/payments/status";
import { paymentStatusIn } from "@/lib/payments/status-sql";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { db } from "@/db/client";
import { deliveries, ledgerEntries, mealSizes, messageSuppression, notificationOutbox, orders, payments, plans, renewals as renewalRecords, tickets, users, walletLedger } from "@/db/schema";
import { unexpired } from "@foundry/wallet";
import { renewalQueueFilter, type DateBy, type PlanType, type RenewalsFilter, type TrackFilter } from "@/lib/renewals/filters";
import { UNASSIGNED_OWNER } from "@/lib/list/presets";
import { lastTiffinSql, renewalStatusSql, visibleOrgWhere, type RenewalStatus } from "@/lib/orders/queries";
import { addDaysIso, DAY_MS, daysBetween } from "@foundry/commons/util/dates";
import { computedStatusSql, effectiveTrackStatusSql, followUpWhere, getTrackRows, laterBookedAtSql, latestTrackActivities, listTrackActivities, type TrackActivity, type TrackRow } from "./renewal-tracking.service";
import type { TrackStatus } from "@/lib/renewals/status";
import type { LostReason } from "./inquiries.service";

export type RenewalRow = {
  orderPublicId: string;
  /** Opens the customer's renewal page. Null only for an order with no account. */
  customerPublicId: string | null;
  code: string;
  customerName: string;
  phone: string | null;
  planName: string;
  mealSize: string;
  lastTiffin: string;
  /** This plan's total: the "Last spent" column. */
  planTotal: string;
  /** Computed renewal status (what the next plan did), not the staff track status. */
  status: RenewalStatus;
  trial: boolean;
  /** Effective staff track status; null is New. */
  track: TrackStatus | null;
  trackSource: "staff" | "auto" | null;
  lostReason: LostReason | null;
  nextFollowUpAt: number | null;
  /** When the next plan was booked (renewed date); null when nothing later is booked. */
  laterBookedAt: number | null;
  /** Latest activity, any type except a status change with no note. */
  lastActivity: { type: TrackActivity["type"]; note: string | null; at: number } | null;
  /** Facts, not predictions: earlier paid plans, held or paused days on this plan, unresolved tickets. */
  priorPlans: number;
  holds: number;
  openTickets: number;
  walletCoins: number;
  totalSpent: string;
  prevOrderTotal: string | null;
};

export type RenewalCounts = { plans: number; renewed: number; renewedNotPaid: number; notRenewed: number; lapsed: number };

/** The top date range, resolved by the page: ISO dates in the app timezone for date columns, epoch ms for created_at. */
export type RenewalRange = { by: DateBy; fromIso: string | null; toIso: string | null; fromMs: number | null; toMs: number | null };

/** The app-timezone day bounds (epoch ms) for "today": the follow-up filters compare against them. */
export type DayBounds = { dayStart: number; dayEnd: number };

const typeWhere = (type: PlanType | null) =>
  type === "trial" ? isNotNull(orders.trialLength) : type === "regular" ? isNull(orders.trialLength) : undefined;
const running = sql`${orders.status} in ('active', 'paused')`;
// A plan whose last tiffin has passed may still read active until the complete-plans job closes it.
const runningOrDone = sql`${orders.status} in ('active', 'paused', 'completed')`;

/** Running plans whose last tiffin is today through `days` out. */
const endingWhere = (today: string, days: number) => and(running, sql`${lastTiffinSql} between ${today} and ${addDaysIso(today, days)}`);

/** Plans whose last tiffin was in the last `days` days (over, renewed or not; Status narrows to the lapsed ones). */
const endedWhere = (today: string, days: number) => and(runningOrDone, sql`${lastTiffinSql} between ${addDaysIso(today, -days)} and ${addDaysIso(today, -1)}`);

/**
 * The top date range on its chosen date. Running = any delivery inside it: started by its end, last tiffin on or after its start.
 * Renewed = the next plan was booked inside it (on Trials, the next non-trial plan: the conversion date).
 */
function rangeWhere(r: RenewalRange) {
  if (r.by === "renewed") {
    return and(sql`${laterBookedAtSql} is not null`, r.fromMs != null ? sql`${laterBookedAtSql} >= ${r.fromMs}` : undefined, r.toMs != null ? sql`${laterBookedAtSql} <= ${r.toMs}` : undefined);
  }
  if (r.by === "ordered") return and(r.fromMs != null ? gte(orders.createdAt, r.fromMs) : undefined, r.toMs != null ? lte(orders.createdAt, r.toMs) : undefined);
  if (r.by === "running") return and(r.toIso ? sql`${orders.startDate} <= ${r.toIso}` : undefined, r.fromIso ? sql`${lastTiffinSql} >= ${r.fromIso}` : undefined);
  return and(r.fromIso ? sql`${lastTiffinSql} >= ${r.fromIso}` : undefined, r.toIso ? sql`${lastTiffinSql} <= ${r.toIso}` : undefined);
}

/** Status filter: Not renewed and Lapsed are both "no later plan", split on whether the last tiffin has passed. */
function statusWhere(f: RenewalsFilter, today: string) {
  if (!f.status) return undefined;
  const status = computedStatusSql;
  if (f.status === "not_renewed") return and(sql`${status} = 'none'`, sql`${lastTiffinSql} >= ${today}`);
  if (f.status === "lapsed") return and(sql`${status} = 'none'`, sql`${lastTiffinSql} < ${today}`);
  if (f.status === "booked_unpaid") return sql`${status} in ('unpaid', 'waitlisted')`;
  return sql`${status} = ${f.status}`;
}

/** Staff track status, where "new" is a plan with no effective status. */
function trackWhere(track: readonly TrackFilter[] | null) {
  if (!track) return undefined;
  const statuses = track.filter((t): t is TrackStatus => t !== "new");
  return or(
    statuses.length ? sql`${effectiveTrackStatusSql} in (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})` : undefined,
    track.includes("new") ? sql`${effectiveTrackStatusSql} is null` : undefined,
  );
}

/** Every word must hit the name, order code or phone, in any order (same rule as the other list searches). */
const searchWhere = (q: string) =>
  and(...q.split(" ").filter(Boolean).map((w) => or(ilike(orders.fullName, `%${w}%`), ilike(orders.deploymentId, `%${w}%`), ilike(users.phone, `%${w}%`))));

/** To renew: ending within 7 days or lapsed within 14, and nothing booked after (computed status none). */
const renewWindowWhere = (today: string) => and(sql`${computedStatusSql} = 'none'`, or(endingWhere(today, 7), endedWhere(today, 14)));
/**
 * Due / overdue / upcoming and To renew are their own lists: the top date range and the Ending / Ended windows do not narrow them.
 * "none" (no follow-up) is a plain filter on the range and windows, like any other.
 */
export function renewalsWhere(visible: "all" | string[], f: RenewalsFilter, today: string, range: RenewalRange, day: DayBounds) {
  const dayView = f.followUp && f.followUp !== "none" ? f.followUp : null;
  return and(
    typeWhere(f.type),
    visibleOrgWhere(visible),
    runningOrDone,
    dayView
      ? followUpWhere(dayView, day.dayStart, day.dayEnd)
      : f.renewWindow
        ? renewWindowWhere(today)
        : and(
            rangeWhere(range),
            f.ending != null || f.ended != null
              ? or(f.ending != null ? endingWhere(today, f.ending) : undefined, f.ended != null ? endedWhere(today, f.ended) : undefined)
              : undefined,
          ),
    f.followUp === "none" ? followUpWhere("none", day.dayStart, day.dayEnd) : undefined,
    statusWhere(f, today),
    trackWhere(f.track),
    f.owner ? ownerWhere(f.owner) : undefined,
    f.q ? searchWhere(f.q) : undefined,
  );
}

function ownerWhere(owner: string) {
  return owner === UNASSIGNED_OWNER
    ? isNull(orders.currentOwner)
    : inArray(orders.currentOwner, db.select({ id: users.id }).from(users).where(eq(users.publicId, owner)));
}

export const renewalSelect = {
  id: orders.id,
  userId: orders.userId,
  orderPublicId: orders.publicId,
  customerPublicId: users.publicId,
  code: orders.deploymentId,
  customerName: orders.fullName,
  phone: users.phone,
  planName: plans.name,
  mealSize: mealSizes.name,
  lastTiffin: sql<string>`${lastTiffinSql}`,
  planTotal: orders.total,
  trial: sql<boolean>`${orders.trialLength} is not null`,
  priorPlans: sql<number>`(select cast(count(*) as int) from ${orders} as prior where prior.user_id = ${orders.userId} and prior.id <> ${orders.id} and prior.trial_length is null and prior.status in ('active', 'paused', 'completed') and prior.start_date < ${orders.startDate})`,
  holds: sql<number>`(select cast(count(*) as int) from ${deliveries} as d where d.order_id = ${orders.id} and d.status in ('skipped', 'paused'))`,
  openTickets: sql<number>`(select cast(count(*) as int) from ${tickets} as t where t.raised_by = ${orders.userId} and t.status not in ('resolved', 'closed'))`,
};

export async function hydrateRenewalRows(
  rows: {
    id: bigint;
    userId: bigint | null;
    orderPublicId: string;
    customerPublicId: string | null;
    code: string;
    customerName: string;
    phone: string | null;
    planName: string;
    mealSize: string;
    lastTiffin: string;
    planTotal: string;
    status: RenewalStatus;
    trial: boolean;
    priorPlans: number;
    holds: number;
    openTickets: number;
  }[],
): Promise<RenewalRow[]> {
  const orderIds = rows.map((r) => r.orderPublicId);
  const [money, tracks, latest] = await Promise.all([
    renewalMoney(rows.map((r) => ({ id: r.id, userId: r.userId }))),
    getTrackRows(orderIds),
    latestTrackActivities(orderIds),
  ]);
  return rows.map(({ id, userId, ...r }) => {
    const uid = userId?.toString();
    const track = tracks.get(r.orderPublicId);
    return {
      ...r,
      walletCoins: uid ? (money.walletByUser.get(uid) ?? 0) : 0,
      totalSpent: uid ? (money.spentByUser.get(uid) ?? "0.00") : "0.00",
      prevOrderTotal: money.prevTotalByOrder.get(id.toString()) ?? null,
      track: track?.status ?? null,
      trackSource: track?.source ?? null,
      lostReason: track?.lostReason ?? null,
      nextFollowUpAt: track?.nextFollowUpAt ?? null,
      laterBookedAt: track?.laterBookedAt ?? null,
      lastActivity: latest.get(r.orderPublicId) ?? null,
    };
  });
}

/** Plans that ran (running or finished) in the top date range, narrowed by the optional Ending / Ended windows, Status and search. */
export async function listRenewals(
  visible: "all" | string[],
  f: RenewalsFilter,
  today: string,
  page: PageRequest,
  range: RenewalRange,
  day: DayBounds,
): Promise<Page<RenewalRow>> {
  if (visible !== "all" && visible.length === 0) return { items: [], page: page.page, size: page.size, total: 0 };
  const where = renewalsWhere(visible, f, today, range, day);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({ ...renewalSelect, status: computedStatusSql })
      .from(orders)
      .innerJoin(plans, eq(orders.planId, plans.id))
      .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
      .leftJoin(users, eq(orders.userId, users.id))
      .leftJoin(renewalRecords, eq(renewalRecords.orderId, orders.id))
      .where(where)
      // Upcoming endings first, soonest on top; then lapsed plans, most recent first.
      .orderBy(asc(sql`${lastTiffinSql} < ${today}`), asc(sql`case when ${lastTiffinSql} >= ${today} then ${lastTiffinSql} end`), desc(lastTiffinSql), asc(orders.id))
      .limit(page.size)
      .offset(pageOffset(page.page, page.size)),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.id))
      .leftJoin(renewalRecords, eq(renewalRecords.orderId, orders.id))
      .where(where),
  ]);

  return { items: await hydrateRenewalRows(rows), page: page.page, size: page.size, total: count };
}

/** Full (unpaginated) matching set for the Excel export — same filters as the on-screen list. */
export async function listRenewalsForExport(visible: "all" | string[], f: RenewalsFilter, today: string, range: RenewalRange, day: DayBounds): Promise<RenewalRow[]> {
  if (visible !== "all" && visible.length === 0) return [];
  const where = renewalsWhere(visible, f, today, range, day);
  const rows = await db
    .select({ ...renewalSelect, status: computedStatusSql })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .leftJoin(renewalRecords, eq(renewalRecords.orderId, orders.id))
    .where(where)
    .orderBy(asc(sql`${lastTiffinSql} < ${today}`), asc(sql`case when ${lastTiffinSql} >= ${today} then ${lastTiffinSql} end`), desc(lastTiffinSql), asc(orders.id));
  return hydrateRenewalRows(rows);
}

/** The five cards: plans in the top date range, split by where their renewal stands. */
export async function countRenewals(visible: "all" | string[], type: PlanType | null, today: string, range: RenewalRange): Promise<RenewalCounts> {
  if (visible !== "all" && visible.length === 0) return { plans: 0, renewed: 0, renewedNotPaid: 0, notRenewed: 0, lapsed: 0 };
  const status = computedStatusSql;
  const [r] = await db
    .select({
      plans: sql<number>`cast(count(*) as int)`,
      renewed: sql<number>`cast(count(*) filter (where ${status} = 'renewed') as int)`,
      renewedNotPaid: sql<number>`cast(count(*) filter (where ${status} in ('unpaid', 'waitlisted')) as int)`,
      notRenewed: sql<number>`cast(count(*) filter (where ${status} = 'none' and ${lastTiffinSql} >= ${today}) as int)`,
      lapsed: sql<number>`cast(count(*) filter (where ${status} = 'none' and ${lastTiffinSql} < ${today}) as int)`,
    })
    .from(orders)
    .where(and(typeWhere(type), visibleOrgWhere(visible), runningOrDone, rangeWhere(range)));
  return r;
}

export type TrackQueueCounts = { renew: number; due: number; overdue: number; upcoming: number; open: number; closed: number };
/** The Inquiries Renewals queues: the follow-up lists ignore the top range (as listRenewals does), Open and Closed use it. */
export async function countTrackQueues(visible: "all" | string[], filter: RenewalsFilter, today: string, range: RenewalRange, day: DayBounds): Promise<TrackQueueCounts> {
  if (visible !== "all" && visible.length === 0) return { renew: 0, due: 0, overdue: 0, upcoming: 0, open: 0, closed: 0 };
  const base = { ...filter, type: null, ending: null, ended: null, status: null, renewed: null };
  const countWhere = (f: RenewalsFilter) =>
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.id))
      .leftJoin(renewalRecords, eq(renewalRecords.orderId, orders.id))
      .where(renewalsWhere(visible, f, today, range, day))
      .then(([r]) => r.count);
  const [renew, due, overdue, upcoming, open, closed] = await Promise.all([
    countWhere({ ...base, ...renewalQueueFilter("renew") }),
    countWhere({ ...base, ...renewalQueueFilter("due") }),
    countWhere({ ...base, ...renewalQueueFilter("overdue") }),
    countWhere({ ...base, ...renewalQueueFilter("upcoming") }),
    countWhere({ ...base, ...renewalQueueFilter("open") }),
    countWhere({ ...base, ...renewalQueueFilter("closed") }),
  ]);
  return { renew, due, overdue, upcoming, open, closed };
}

// ── Renewed customers ────────────────────────────────────────────────────────

/** A plan that follows an earlier running or finished plan of the same customer: a renewal. */
// The mirror of laterOrderSql: an earlier plan that this one outlasts (a parallel plan that ends first is not one).
const isRenewalSql = sql`exists (select 1 from ${orders} as prior where prior.user_id = ${orders.userId} and prior.id <> ${orders.id} and prior.status in ('active', 'paused', 'completed') and prior.start_date < ${orders.startDate} and coalesce((select max(pd.delivery_date) from ${deliveries} as pd where pd.order_id = prior.id and pd.status <> 'cancelled'), '9999-12-31') <= coalesce(${lastTiffinSql}, '9999-12-31'))`;
const notCancelled = sql`${orders.status} <> 'cancelled'`;

export type RenewedCustomerRow = {
  customerPublicId: string;
  customerName: string;
  phone: string | null;
  plans: number;
  renewals: number;
  lastRenewedAt: number;
  /** The plan running now, if any. */
  currentMealSize: string | null;
  currentLastTiffin: string | null;
  totalSpent: string;
};

type RenewedCustomersOpts = { renewedWithin: number | null; q: string; from?: number | null; to?: number | null; now?: number };

function renewedCustomersGrouped(visible: "all" | string[], opts: RenewedCustomersOpts) {
  const renewals = sql<number>`cast(count(*) filter (where ${notCancelled} and ${isRenewalSql}) as int)`;
  const lastRenewedAt = sql<number>`max(${orders.createdAt}) filter (where ${notCancelled} and ${isRenewalSql})`;
  const since = opts.renewedWithin != null ? (opts.now ?? Date.now()) - opts.renewedWithin * DAY_MS : null;
  return db
    .select({
      userId: users.id,
      customerPublicId: users.publicId,
      customerName: sql<string>`coalesce(${users.name}, '')`.as("customer_name"),
      phone: users.phone,
      plans: sql<number>`cast(count(*) filter (where ${notCancelled}) as int)`.as("plans"),
      renewals: renewals.as("renewals"),
      lastRenewedAt: lastRenewedAt.as("last_renewed_at"),
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(and(visibleOrgWhere(visible), opts.q ? and(...opts.q.split(" ").map((w) => or(ilike(users.name, `%${w}%`), ilike(users.phone, `%${w}%`), ilike(users.email, `%${w}%`)))) : undefined))
    .groupBy(users.id)
    .having(and(
      sql`${renewals} > 0`,
      since != null ? sql`${lastRenewedAt} >= ${since}` : undefined,
      opts.from != null ? sql`${lastRenewedAt} >= ${opts.from}` : undefined,
      opts.to != null ? sql`${lastRenewedAt} <= ${opts.to}` : undefined,
    ))
    .as("renewed_customers");
}

async function hydrateRenewedCustomers(
  visible: "all" | string[],
  rows: { userId: bigint; customerPublicId: string; customerName: string; phone: string | null; plans: number; renewals: number; lastRenewedAt: number }[],
): Promise<RenewedCustomerRow[]> {
  const userIds = rows.map((r) => r.userId);
  const [current, money] = await Promise.all([
    userIds.length
      ? db
          .select({ userId: orders.userId, mealSize: mealSizes.name, lastTiffin: sql<string | null>`${lastTiffinSql}` })
          .from(orders)
          .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
          .where(and(inArray(orders.userId, userIds), running, visibleOrgWhere(visible)))
          .orderBy(desc(orders.startDate))
      : Promise.resolve([]),
    renewalMoney(rows.map((r) => ({ id: r.userId, userId: r.userId }))),
  ]);
  const currentBy = new Map<string, { mealSize: string; lastTiffin: string | null }>();
  for (const c of current) if (c.userId && !currentBy.has(c.userId.toString())) currentBy.set(c.userId.toString(), c);

  return rows.map(({ userId, ...r }) => {
    const cur = currentBy.get(userId.toString());
    return {
      ...r,
      lastRenewedAt: Number(r.lastRenewedAt),
      currentMealSize: cur?.mealSize ?? null,
      currentLastTiffin: cur?.lastTiffin ?? null,
      totalSpent: money.spentByUser.get(userId.toString()) ?? "0.00",
    };
  });
}

/** Every customer with at least one renewal, newest renewal first; `renewedWithin` keeps those who renewed in the last N days. */
export async function listRenewedCustomers(
  visible: "all" | string[],
  /** `from`/`to`: epoch-ms bounds on the last renewal's order date (the date facet). */
  opts: RenewedCustomersOpts,
  page: PageRequest,
): Promise<Page<RenewedCustomerRow>> {
  if (visible !== "all" && visible.length === 0) return { items: [], page: page.page, size: page.size, total: 0 };
  const grouped = renewedCustomersGrouped(visible, opts);

  const [rows, [{ count }]] = await Promise.all([
    db.select().from(grouped).orderBy(desc(grouped.lastRenewedAt), asc(grouped.userId)).limit(page.size).offset(pageOffset(page.page, page.size)),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(grouped),
  ]);

  return { items: await hydrateRenewedCustomers(visible, rows), page: page.page, size: page.size, total: count };
}

/** Full (unpaginated) matching set for the Excel export — same filters as the on-screen list. */
export async function listRenewedCustomersForExport(visible: "all" | string[], opts: RenewedCustomersOpts): Promise<RenewedCustomerRow[]> {
  if (visible !== "all" && visible.length === 0) return [];
  const grouped = renewedCustomersGrouped(visible, opts);
  const rows = await db.select().from(grouped).orderBy(desc(grouped.lastRenewedAt), asc(grouped.userId));
  return hydrateRenewedCustomers(visible, rows);
}

// ── One customer's renewal history ───────────────────────────────────────────

export type RenewalPlan = {
  orderPublicId: string;
  code: string;
  mealSize: string;
  trial: boolean;
  status: string;
  startDate: string;
  lastTiffin: string | null;
  total: string;
  createdAt: number;
  next: RenewalStatus;
  /** Days from this plan's last tiffin to the next plan's start; negative means booked to overlap the end. */
  gapDays: number | null;
  /** An unpaid plan's newest unpaid or rejected payment: what "Send payment reminder" reminds. */
  unpaidPaymentPublicId: string | null;
  track: TrackRow;
  /** This plan's own tracking log, newest first. */
  activities: TrackActivity[];
};

const NO_TRACK: TrackRow = { status: null, source: null, lostReason: null, nextFollowUpAt: null, laterBookedAt: null };

/** An auto status has no row to read, so its timeline entry is made here: the booking that set it. */
function withBookingEntry(orderPublicId: string, track: TrackRow, acts: TrackActivity[]): TrackActivity[] {
  if (track.source !== "auto" || track.laterBookedAt == null) return acts;
  const entry: TrackActivity = {
    publicId: `auto-${orderPublicId}`,
    type: "status_change",
    note: "New plan booked",
    outcome: null,
    fromStatus: null,
    toStatus: track.status,
    nextFollowUpAt: null,
    createdAt: track.laterBookedAt,
    actor: { label: "System", kind: "system" },
  };
  return [...acts, entry].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * What AWS SES told us about one reminder. SES reports delivery, bounces and spam complaints; it never
 * says whether mail landed in a spam folder, and opens are not tracked on transactional mail (spam risk).
 */
export type ReminderDelivery = "queued" | "sent" | "delivered" | "bounced" | "spam" | "failed";

/** `daysLeft` is 5 or 1 for the automatic reminder; null when staff sent it by hand. */
export type RenewalReminder = {
  sentAt: number;
  daysLeft: number | null;
  byStaff: boolean;
  orderPublicId: string | null;
  delivery: ReminderDelivery;
  deliveredAt: number | null;
  error: string | null;
};

/** The customer's address is blocked after a hard bounce or spam complaint: no email reaches them. */
export type EmailBlock = { reason: "bounce" | "complaint" | "other"; since: number };

export type CustomerRenewal = {
  customer: { publicId: string; name: string; phone: string | null; email: string | null };
  plans: RenewalPlan[];
  reminders: RenewalReminder[];
  emailBlock: EmailBlock | null;
  walletCoins: number;
  totalSpent: string;
};

/**
 * One reminder's outcome. A block that started after the send is what that send ran into: a complaint
 * after delivery means the customer marked it spam; a bounce on an undelivered send means it bounced.
 */
export function reminderDelivery(status: string, deliveredAt: number | null, sentAt: number, block: EmailBlock | null): ReminderDelivery {
  if (status === "failed") return "failed";
  if (status === "pending" || status === "processing") return "queued";
  const after = block != null && block.since >= sentAt;
  if (deliveredAt != null) return after && block.reason === "complaint" ? "spam" : "delivered";
  return after && block.reason === "bounce" ? "bounced" : "sent";
}

/** Everything about one customer's renewals, limited to plans in the staff member's organizations; null when none are visible. */
export async function getCustomerRenewal(visible: "all" | string[], customerPublicId: string): Promise<CustomerRenewal | null> {
  if (visible !== "all" && visible.length === 0) return null;
  const [user] = await db
    .select({ id: users.id, publicId: users.publicId, name: users.name, phone: users.phone, email: users.email })
    .from(users)
    .where(eq(users.publicId, customerPublicId))
    .limit(1);
  if (!user) return null;

  const rows = await db
    .select({
      id: orders.id,
      orderPublicId: orders.publicId,
      code: orders.deploymentId,
      mealSize: mealSizes.name,
      trialLength: orders.trialLength,
      status: orders.status,
      startDate: orders.startDate,
      lastTiffin: sql<string | null>`${lastTiffinSql}`,
      total: orders.total,
      createdAt: orders.createdAt,
      next: renewalStatusSql(),
    })
    .from(orders)
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .where(and(eq(orders.userId, user.id), notCancelled, visibleOrgWhere(visible)))
    .orderBy(asc(orders.startDate), asc(orders.id));
  if (rows.length === 0) return null;

  const pendingIds = rows.filter((r) => r.status === "pending").map((r) => r.id);
  const unpaid = new Map<string, string>();
  if (pendingIds.length) {
    const pays = await db
      .select({ orderId: payments.orderId, publicId: payments.publicId })
      .from(payments)
      .where(and(inArray(payments.orderId, pendingIds), isNull(payments.addonRequest), paymentStatusIn(UNPAID)))
      .orderBy(desc(payments.createdAt));
    for (const p of pays) if (!unpaid.has(p.orderId.toString())) unpaid.set(p.orderId.toString(), p.publicId);
  }

  const orderPublicIds = rows.map((r) => r.orderPublicId);
  const [tracks, activities] = await Promise.all([getTrackRows(orderPublicIds), listTrackActivities(orderPublicIds)]);
  const plans = rows.map(({ id, trialLength, ...r }, i) => {
    const after = rows[i + 1];
    const track = tracks.get(r.orderPublicId) ?? NO_TRACK;
    return {
      ...r,
      trial: trialLength != null,
      gapDays: after && r.lastTiffin ? daysBetween(r.lastTiffin, after.startDate) : null,
      unpaidPaymentPublicId: unpaid.get(id.toString()) ?? null,
      track,
      activities: withBookingEntry(r.orderPublicId, track, activities.get(r.orderPublicId) ?? []),
    };
  });

  const [reminderRows, money] = await Promise.all([
    db
      .select({
        sentAt: notificationOutbox.createdAt,
        status: notificationOutbox.status,
        key: notificationOutbox.dedupeKey,
        deliveredAt: notificationOutbox.deliveredAt,
        error: notificationOutbox.lastError,
      })
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.recipientId, user.id), like(notificationOutbox.dedupeKey, "renewal:%")))
      .orderBy(desc(notificationOutbox.createdAt))
      .limit(50),
    renewalMoney([{ id: rows[rows.length - 1].id, userId: user.id }]),
  ]);
  // Bounces and complaints are kept per address (all channels' "all" scope), not per message.
  const [block] = user.email
    ? await db
        .select({ reason: messageSuppression.reason, since: messageSuppression.createdAt })
        .from(messageSuppression)
        .where(and(eq(messageSuppression.address, user.email.trim().toLowerCase()), eq(messageSuppression.channel, "email"), eq(messageSuppression.scope, "all")))
        .limit(1)
    : [];
  const emailBlock: EmailBlock | null = block
    ? { reason: /complaint/i.test(block.reason) ? "complaint" : /bounce/i.test(block.reason) ? "bounce" : "other", since: Number(block.since) }
    : null;
  // Key shape: renewal:<orderPublicId>:<lastTiffin>:<daysLeft | staff-<date>>:<channel>.
  // Only reminders for plans this staff member can see: another franchise's plans stay hidden.
  const visiblePlans = new Set(rows.map((r) => r.orderPublicId));
  const reminders = reminderRows
    .map((r) => {
      const [, orderPublicId, , days] = (r.key ?? "").split(":");
      const byStaff = days?.startsWith("staff") ?? false;
      const sentAt = Number(r.sentAt);
      return {
        sentAt,
        daysLeft: !byStaff && days ? Number(days) : null,
        byStaff,
        orderPublicId: orderPublicId ?? null,
        delivery: reminderDelivery(r.status, r.deliveredAt, sentAt, emailBlock),
        deliveredAt: r.deliveredAt == null ? null : Number(r.deliveredAt),
        error: r.error ?? null,
      };
    })
    .filter((r) => r.orderPublicId != null && visiblePlans.has(r.orderPublicId));

  return {
    customer: { publicId: user.publicId, name: user.name ?? "", phone: user.phone, email: user.email },
    plans,
    reminders,
    emailBlock,
    walletCoins: money.walletByUser.get(user.id.toString()) ?? 0,
    totalSpent: money.spentByUser.get(user.id.toString()) ?? "0.00",
  };
}

/** Batch wallet / lifetime spend / previous-plan total for Renewals rows. */
export async function renewalMoney(
  rows: { id: bigint; userId: bigint | null }[],
): Promise<{
  walletByUser: Map<string, number>;
  spentByUser: Map<string, string>;
  prevTotalByOrder: Map<string, string | null>;
}> {
  const walletByUser = new Map<string, number>();
  const spentByUser = new Map<string, string>();
  const prevTotalByOrder = new Map<string, string | null>();

  const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is bigint => id != null))];
  if (userIds.length === 0) {
    for (const r of rows) prevTotalByOrder.set(r.id.toString(), null);
    return { walletByUser, spentByUser, prevTotalByOrder };
  }

  const now = Date.now();
  const [wallets, spends, history] = await Promise.all([
    db
      .select({
        userId: walletLedger.userId,
        balance: sql<number>`cast(coalesce(sum(case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end), 0) as int)`,
      })
      .from(walletLedger)
      .where(and(inArray(walletLedger.userId, userIds), unexpired(walletLedger, now)))
      .groupBy(walletLedger.userId),
    db
      .select({
        userId: ledgerEntries.userId,
        // Same formula as ledgerService.totalSpent — payment credits minus refund debits.
        spent: sql<string>`(coalesce(sum(case when ${ledgerEntries.type} = 'payment' then ${ledgerEntries.amount} else 0 end), 0) - coalesce(sum(case when ${ledgerEntries.type} = 'refund' then ${ledgerEntries.amount} else 0 end), 0))::text`,
      })
      .from(ledgerEntries)
      .where(inArray(ledgerEntries.userId, userIds))
      .groupBy(ledgerEntries.userId),
    db
      .select({
        id: orders.id,
        userId: orders.userId,
        total: orders.total,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(inArray(orders.userId, userIds))
      .orderBy(asc(orders.userId), asc(orders.createdAt), asc(orders.id)),
  ]);

  for (const w of wallets) walletByUser.set(w.userId.toString(), Number(w.balance) || 0);
  for (const s of spends) spentByUser.set(s.userId.toString(), Number(s.spent).toFixed(2));

  // Walk each customer's plans in created order; lag(total) is the previous plan.
  let lastUser: string | null = null;
  let lastTotal: string | null = null;
  const prevById = new Map<string, string | null>();
  for (const h of history) {
    const uid = h.userId!.toString();
    if (uid !== lastUser) {
      lastUser = uid;
      lastTotal = null;
    }
    prevById.set(h.id.toString(), lastTotal);
    lastTotal = h.total;
  }
  for (const r of rows) prevTotalByOrder.set(r.id.toString(), prevById.get(r.id.toString()) ?? null);

  return { walletByUser, spentByUser, prevTotalByOrder };
}
