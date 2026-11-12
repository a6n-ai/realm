import { ONGOING, RUNNING, RUNNING_OR_DONE } from "@/lib/orders/status";
import { orderStatusIn } from "@/lib/orders/status-sql";
import { zonedDateIso } from "@foundry/commons";
import { and, inArray, isNotNull, isNull, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, orderActivities, orders, payments } from "@/db/schema";
import { getAppSettings } from "./app-settings.service";
import { PENDING } from "@/lib/payments/status";
import { paymentStatusIn } from "@/lib/payments/status-sql";
import { freeTiffinsWhere, lastTiffinSql, laterOrderSql, paymentReviewWhere, visibleOrgWhere, type FreeTiffinRange } from "@/lib/orders/queries";
import { addDaysIso, DAY_MS } from "@foundry/commons/util/dates";
import { requestNow } from "@/lib/dates/request-now";
import { BOOKED, STARTING_SOON } from "@/lib/orders/status";

export type OrdersOverview = {
  newOrders: { count: number; prevCount: number; returning: number };
  startingSoon: { count: number; unpaid: number; waitlisted: number };
  running: { count: number; trials: number };
  renewals: { ended: number; renewed: number };
  cancelled: { count: number; prevCount: number };
};

const n = (v: unknown) => Number(v ?? 0);

/**
 * Header cards for the Orders page. Period figures cover [from, to] (epoch ms, inclusive) and
 * compare against the same-length window just before it; "now" figures ignore the range.
 */
export async function getOrdersOverview(range: { from: number; to: number }, visible: "all" | string[]): Promise<OrdersOverview> {
  const { timezone } = await getAppSettings();
  const len = range.to - range.from + 1;
  const prev = { from: range.from - len, to: range.from - 1 };
  const inOrgs: SQL | undefined = visible === "all" ? undefined : inArray(orders.organizationId, visible.length ? visible : ["-"]);
  const between = (col: SQL | AnyColumn, r: { from: number; to: number }) => sql`${col} between ${r.from} and ${r.to}`;

  const today = zonedDateIso(requestNow(), timezone);
  const fromIso = zonedDateIso(range.from, timezone);
  const toIso = [zonedDateIso(range.to, timezone), today].sort()[0]!;

  // A returning customer had an earlier non-cancelled order before this one was placed.
  const returning = sql`exists (select 1 from ${orders} as prior where prior.user_id = ${orders.userId} and prior.id <> ${orders.id} and prior.status <> 'cancelled' and prior.created_at < ${orders.createdAt})`;

  const [[o], [soon], [r], [ren], [c]] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*) filter (where ${between(orders.createdAt, range)})`,
        prevCount: sql<number>`count(*) filter (where ${between(orders.createdAt, prev)})`,
        returning: sql<number>`count(*) filter (where ${between(orders.createdAt, range)} and ${returning})`,
      })
      .from(orders)
      .where(and(inArray(orders.status, [...BOOKED]), between(orders.createdAt, { from: prev.from, to: range.to }), inOrgs)),
    // Plans whose first tiffin is due within the next week: the ones staff still have to get ready.
    db
      .select({
        count: sql<number>`count(*)`,
        unpaid: sql<number>`count(*) filter (where ${orders.status} = 'pending')`,
        waitlisted: sql<number>`count(*) filter (where ${orders.status} = 'waitlisted')`,
      })
      .from(orders)
      .where(and(
        inArray(orders.status, [...STARTING_SOON]),
        sql`${orders.startDate} between ${today} and ${addDaysIso(today, 6)}`,
        inOrgs,
      )),
    db
      .select({
        count: sql<number>`count(*)`,
        trials: sql<number>`count(*) filter (where ${isNotNull(orders.trialLength)})`,
      })
      .from(orders)
      .where(and(orderStatusIn(RUNNING), inOrgs)),
    // Paid plans whose last tiffin landed in the range (up to today), and how many already have a next plan.
    fromIso > toIso
      ? Promise.resolve([{ ended: 0, renewed: 0 }])
      : db
          .select({
            ended: sql<number>`count(*)`,
            renewed: sql<number>`count(*) filter (where ${laterOrderSql})`,
          })
          .from(orders)
          .where(and(
            isNull(orders.trialLength),
            orderStatusIn(RUNNING_OR_DONE),
            sql`${lastTiffinSql} between ${fromIso} and ${toIso}`,
            inOrgs,
          )),
    // Cancelling is one-way and always logs a "cancelled" activity, so its timestamp is the cancel date.
    db
      .select({
        count: sql<number>`count(distinct ${orders.id}) filter (where ${between(orderActivities.createdAt, range)})`,
        prevCount: sql<number>`count(distinct ${orders.id}) filter (where ${between(orderActivities.createdAt, prev)})`,
      })
      .from(orderActivities)
      .innerJoin(orders, sql`${orders.id} = ${orderActivities.orderId}`)
      .where(and(
        sql`${orderActivities.type} = 'cancelled'`,
        between(orderActivities.createdAt, { from: prev.from, to: range.to }),
        inOrgs,
      )),
  ]);

  return {
    newOrders: { count: n(o?.count), prevCount: n(o?.prevCount), returning: n(o?.returning) },
    startingSoon: { count: n(soon?.count), unpaid: n(soon?.unpaid), waitlisted: n(soon?.waitlisted) },
    running: { count: n(r?.count), trials: n(r?.trials) },
    renewals: { ended: n(ren?.ended), renewed: n(ren?.renewed) },
    cancelled: { count: n(c?.count), prevCount: n(c?.prevCount) },
  };
}

// Same threshold as the Payments page overdue queue (lib/services/payments-list.service.ts OVERDUE_DAYS).
export const OVERDUE_DAYS = 3;

const hidden = (visible: "all" | string[]) => visible !== "all" && visible.length === 0;

export type LookOutStats = { flagged: number; running: number; unpaid: number; inRange: number };

/** Look out for cards: the flagged set ignores dates, only the last card follows the range (epoch ms). */
export async function getLookOutStats(visible: "all" | string[], range: { from: number; to: number }): Promise<LookOutStats> {
  if (hidden(visible)) return { flagged: 0, running: 0, unpaid: 0, inRange: 0 };
  const [r] = await db
    .select({
      flagged: sql<number>`cast(count(*) as int)`,
      running: sql<number>`cast(count(*) filter (where ${orderStatusIn(RUNNING)}) as int)`,
      unpaid: sql<number>`cast(count(*) filter (where ${paymentReviewWhere()}) as int)`,
      inRange: sql<number>`cast(count(*) filter (where ${orders.lookOutAt} between ${range.from} and ${range.to}) as int)`,
    })
    .from(orders)
    .where(and(isNotNull(orders.lookOutAt), visibleOrgWhere(visible)));
  return r ?? { flagged: 0, running: 0, unpaid: 0, inRange: 0 };
}

export type PaymentReviewStats = { owed: number; needsReview: number; overdue: number };

/** Payment review cards: same rows as the tab (review-status payments on open orders), all dates. */
export async function getPaymentReviewStats(visible: "all" | string[]): Promise<PaymentReviewStats> {
  if (hidden(visible)) return { owed: 0, needsReview: 0, overdue: 0 };
  const overdueBefore = requestNow() - OVERDUE_DAYS * DAY_MS;
  const [r] = await db
    .select({
      owed: sql<string>`coalesce(sum(${payments.amount}), 0)`,
      needsReview: sql<number>`cast(count(*) filter (where ${payments.status} = 'pending_verification') as int)`,
      overdue: sql<number>`cast(count(*) filter (where ${payments.status} = 'awaiting_payment' and ${payments.createdAt} < ${overdueBefore}) as int)`,
    })
    .from(payments)
    .innerJoin(orders, sql`${orders.id} = ${payments.orderId}`)
    .where(and(
      orderStatusIn(ONGOING),
      isNull(payments.addonRequest),
      paymentStatusIn(PENDING),
      visibleOrgWhere(visible),
    ));
  return { owed: n(r?.owed), needsReview: n(r?.needsReview), overdue: n(r?.overdue) };
}

export type FreeTiffinStats = { delivered: number; toDeliver: number };

/** Free tiffin cards: delivered follows the range (already capped at today); to-deliver is every later scheduled one. */
export async function getFreeTiffinStats(visible: "all" | string[], range: FreeTiffinRange, today: string): Promise<FreeTiffinStats> {
  if (hidden(visible)) return { delivered: 0, toDeliver: 0 };
  const [r] = await db
    .select({
      delivered: sql<number>`cast(count(*) filter (where ${deliveries.deliveryDate} between ${range.from} and ${range.to}) as int)`,
      toDeliver: sql<number>`cast(count(*) filter (where ${deliveries.deliveryDate} > ${today}) as int)`,
    })
    .from(deliveries)
    .innerJoin(orders, sql`${orders.id} = ${deliveries.orderId}`)
    .where(and(freeTiffinsWhere(), isNotNull(deliveries.complimentaryNote), sql`${deliveries.status} = 'scheduled'`, visibleOrgWhere(visible)));
  return { delivered: n(r?.delivered), toDeliver: n(r?.toDeliver) };
}
