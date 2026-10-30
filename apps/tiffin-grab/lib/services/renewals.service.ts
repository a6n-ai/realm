import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, like, lte, or, sql } from "drizzle-orm";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { db } from "@/db/client";
import { deliveries, mealSizes, messageSuppression, notificationOutbox, orders, payments, plans, tickets, users } from "@/db/schema";
import { addDays } from "@/lib/deliveries-view/week";
import type { DateBy, RenewalsFilter, RenewalsTab } from "@/lib/renewals/filters";
import { lastTiffinSql, renewalMoney, renewalStatusSql, visibleOrgWhere, type RenewalStatus } from "./orders.service";

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
  status: RenewalStatus;
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

const tabWhere = (tab: RenewalsTab) => (tab === "trials" ? isNotNull(orders.trialLength) : isNull(orders.trialLength));
const running = sql`${orders.status} in ('active', 'paused')`;
// A plan whose last tiffin has passed may still read active until the complete-plans job closes it.
const runningOrDone = sql`${orders.status} in ('active', 'paused', 'completed')`;

/** Running plans whose last tiffin is today through `days` out. */
const endingWhere = (today: string, days: number) => and(running, sql`${lastTiffinSql} between ${today} and ${addDays(today, days)}`);

/** Plans whose last tiffin was in the last `days` days (over, renewed or not; Status narrows to the lapsed ones). */
const endedWhere = (today: string, days: number) => and(runningOrDone, sql`${lastTiffinSql} between ${addDays(today, -days)} and ${addDays(today, -1)}`);

/** The top date range on its chosen date. Running = any delivery inside it: started by its end, last tiffin on or after its start. */
function rangeWhere(r: RenewalRange) {
  if (r.by === "ordered") return and(r.fromMs != null ? gte(orders.createdAt, r.fromMs) : undefined, r.toMs != null ? lte(orders.createdAt, r.toMs) : undefined);
  if (r.by === "running") return and(r.toIso ? sql`${orders.startDate} <= ${r.toIso}` : undefined, r.fromIso ? sql`${lastTiffinSql} >= ${r.fromIso}` : undefined);
  return and(r.fromIso ? sql`${lastTiffinSql} >= ${r.fromIso}` : undefined, r.toIso ? sql`${lastTiffinSql} <= ${r.toIso}` : undefined);
}

/** Status filter: Not renewed and Lapsed are both "no later plan", split on whether the last tiffin has passed. */
function statusWhere(f: RenewalsFilter, today: string) {
  if (!f.status) return undefined;
  const status = renewalStatusSql(f.tab === "trials");
  if (f.status === "not_renewed") return and(sql`${status} = 'none'`, sql`${lastTiffinSql} >= ${today}`);
  if (f.status === "lapsed") return and(sql`${status} = 'none'`, sql`${lastTiffinSql} < ${today}`);
  return sql`${status} = ${f.status}`;
}

/** Every word must hit the name, order code or phone, in any order (same rule as the other list searches). */
const searchWhere = (q: string) =>
  and(...q.split(" ").filter(Boolean).map((w) => or(ilike(orders.fullName, `%${w}%`), ilike(orders.deploymentId, `%${w}%`), ilike(users.phone, `%${w}%`))));

/** Plans that ran (running or finished) in the top date range, narrowed by the optional Ending / Ended windows, Status and search. */
export async function listRenewals(visible: "all" | string[], f: RenewalsFilter, today: string, page: PageRequest, range: RenewalRange): Promise<Page<RenewalRow>> {
  if (visible !== "all" && visible.length === 0) return { items: [], page: page.page, size: page.size, total: 0 };
  const where = and(
    tabWhere(f.tab),
    visibleOrgWhere(visible),
    runningOrDone,
    rangeWhere(range),
    f.ending != null || f.ended != null
      ? or(f.ending != null ? endingWhere(today, f.ending) : undefined, f.ended != null ? endedWhere(today, f.ended) : undefined)
      : undefined,
    statusWhere(f, today),
    f.q ? searchWhere(f.q) : undefined,
  );

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
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
        status: renewalStatusSql(f.tab === "trials"),
        priorPlans: sql<number>`(select cast(count(*) as int) from ${orders} as prior where prior.user_id = ${orders.userId} and prior.id <> ${orders.id} and prior.trial_length is null and prior.status in ('active', 'paused', 'completed') and prior.start_date < ${orders.startDate})`,
        holds: sql<number>`(select cast(count(*) as int) from ${deliveries} as d where d.order_id = ${orders.id} and d.status in ('skipped', 'paused'))`,
        openTickets: sql<number>`(select cast(count(*) as int) from ${tickets} as t where t.raised_by = ${orders.userId} and t.status not in ('resolved', 'closed'))`,
      })
      .from(orders)
      .innerJoin(plans, eq(orders.planId, plans.id))
      .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
      .leftJoin(users, eq(orders.userId, users.id))
      .where(where)
      // Upcoming endings first, soonest on top; then lapsed plans, most recent first.
      .orderBy(asc(sql`${lastTiffinSql} < ${today}`), asc(sql`case when ${lastTiffinSql} >= ${today} then ${lastTiffinSql} end`), desc(lastTiffinSql), asc(orders.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(orders).leftJoin(users, eq(orders.userId, users.id)).where(where),
  ]);

  const money = await renewalMoney(rows.map((r) => ({ id: r.id, userId: r.userId })));
  const items = rows.map(({ id, userId, ...r }) => {
    const uid = userId?.toString();
    return {
      ...r,
      walletCoins: uid ? (money.walletByUser.get(uid) ?? 0) : 0,
      totalSpent: uid ? (money.spentByUser.get(uid) ?? "0.00") : "0.00",
      prevOrderTotal: money.prevTotalByOrder.get(id.toString()) ?? null,
    };
  });
  return { items, page: page.page, size: page.size, total: count };
}

/** The five cards: plans in the top date range, split by where their renewal stands. */
export async function countRenewals(visible: "all" | string[], tab: RenewalsTab, today: string, range: RenewalRange): Promise<RenewalCounts> {
  if (visible !== "all" && visible.length === 0) return { plans: 0, renewed: 0, renewedNotPaid: 0, notRenewed: 0, lapsed: 0 };
  const status = renewalStatusSql(tab === "trials");
  const [r] = await db
    .select({
      plans: sql<number>`cast(count(*) as int)`,
      renewed: sql<number>`cast(count(*) filter (where ${status} = 'renewed') as int)`,
      renewedNotPaid: sql<number>`cast(count(*) filter (where ${status} in ('unpaid', 'waitlisted')) as int)`,
      notRenewed: sql<number>`cast(count(*) filter (where ${status} = 'none' and ${lastTiffinSql} >= ${today}) as int)`,
      lapsed: sql<number>`cast(count(*) filter (where ${status} = 'none' and ${lastTiffinSql} < ${today}) as int)`,
    })
    .from(orders)
    .where(and(tabWhere(tab), visibleOrgWhere(visible), runningOrDone, rangeWhere(range)));
  return r;
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

/** Every customer with at least one renewal, newest renewal first; `renewedWithin` keeps those who renewed in the last N days. */
export async function listRenewedCustomers(
  visible: "all" | string[],
  /** `from`/`to`: epoch-ms bounds on the last renewal's order date (the date facet). */
  opts: { renewedWithin: number | null; q: string; from?: number | null; to?: number | null; now?: number },
  page: PageRequest,
): Promise<Page<RenewedCustomerRow>> {
  if (visible !== "all" && visible.length === 0) return { items: [], page: page.page, size: page.size, total: 0 };
  const renewals = sql<number>`cast(count(*) filter (where ${notCancelled} and ${isRenewalSql}) as int)`;
  const lastRenewedAt = sql<number>`max(${orders.createdAt}) filter (where ${notCancelled} and ${isRenewalSql})`;
  const since = opts.renewedWithin != null ? (opts.now ?? Date.now()) - opts.renewedWithin * 86_400_000 : null;
  const grouped = db
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

  const [rows, [{ count }]] = await Promise.all([
    db.select().from(grouped).orderBy(desc(grouped.lastRenewedAt), asc(grouped.userId)).limit(page.size).offset(page.page * page.size),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(grouped),
  ]);

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

  const items = rows.map(({ userId, ...r }) => {
    const cur = currentBy.get(userId.toString());
    return {
      ...r,
      lastRenewedAt: Number(r.lastRenewedAt),
      currentMealSize: cur?.mealSize ?? null,
      currentLastTiffin: cur?.lastTiffin ?? null,
      totalSpent: money.spentByUser.get(userId.toString()) ?? "0.00",
    };
  });
  return { items, page: page.page, size: page.size, total: count };
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
};

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

const dayDiff = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

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
      .where(and(inArray(payments.orderId, pendingIds), isNull(payments.addonRequest), inArray(payments.status, ["awaiting_payment", "rejected"])))
      .orderBy(desc(payments.createdAt));
    for (const p of pays) if (!unpaid.has(p.orderId.toString())) unpaid.set(p.orderId.toString(), p.publicId);
  }

  const plans = rows.map(({ id, trialLength, ...r }, i) => {
    const after = rows[i + 1];
    return {
      ...r,
      trial: trialLength != null,
      gapDays: after && r.lastTiffin ? dayDiff(r.lastTiffin, after.startDate) : null,
      unpaidPaymentPublicId: unpaid.get(id.toString()) ?? null,
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
