import { zonedDateIso } from "@foundry/commons";
import { and, inArray, isNotNull, isNull, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { orderActivities, orders } from "@/db/schema";
import { addDays } from "@/lib/deliveries-view/week";
import { getAppSettings } from "./app-settings.service";
import { lastTiffinSql, laterOrderSql } from "./orders.service";

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

  // eslint-disable-next-line react-hooks/purity -- server-only: "ended so far" is relative to now
  const today = zonedDateIso(Date.now(), timezone);
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
      .where(and(sql`${orders.status} <> 'cancelled'`, between(orders.createdAt, { from: prev.from, to: range.to }), inOrgs)),
    // Plans whose first tiffin is due within the next week: the ones staff still have to get ready.
    db
      .select({
        count: sql<number>`count(*)`,
        unpaid: sql<number>`count(*) filter (where ${orders.status} = 'pending')`,
        waitlisted: sql<number>`count(*) filter (where ${orders.status} = 'waitlisted')`,
      })
      .from(orders)
      .where(and(
        inArray(orders.status, ["pending", "active", "waitlisted"]),
        sql`${orders.startDate} between ${today} and ${addDays(today, 6)}`,
        inOrgs,
      )),
    db
      .select({
        count: sql<number>`count(*)`,
        trials: sql<number>`count(*) filter (where ${isNotNull(orders.trialLength)})`,
      })
      .from(orders)
      .where(and(inArray(orders.status, ["active", "paused"]), inOrgs)),
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
            inArray(orders.status, ["active", "paused", "completed"]),
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
