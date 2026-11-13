// The Orders page "Next order" card: which open order staff should act on next, in one ranking.
import { ONGOING } from "@/lib/orders/status";
import { orderStatusIn } from "@/lib/orders/status-sql";
import { ordersListWhere } from "@/lib/orders/queries";
import { PENDING, type PaymentStatus } from "@/lib/payments/status";
import { paymentStatusIn } from "@/lib/payments/status-sql";
import { hasMissedDeliveries, missedWhere } from "@/lib/orders/missed-where";
import { OVERDUE_DAYS } from "@/lib/orders/orders-stats.service";
import { requestNow } from "@/lib/dates/request-now";
import type { Condition } from "@foundry/commons/model/condition";
import { DAY_MS } from "@foundry/commons/util/dates";
import { and, eq, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, mealSizes, orders, payments, plans, users } from "@/db/schema";

export type NextOrderReason = "verify" | "overdue" | "missed" | "flagged" | "pending";

const REASON_BY_RANK: Record<number, NextOrderReason> = { 0: "verify", 1: "overdue", 2: "missed", 3: "flagged", 4: "pending" };
const NO_REASON = 5;

export type OrderQueueScope = { visible: "all" | string[]; condition?: Condition };

export type NextOrderRow = {
  publicId: string;
  code: string;
  customerName: string;
  phone: string | null;
  planName: string;
  mealSizeName: string;
  /** Cancel is offered only while the order is neither cancelled nor completed. */
  status: string;
  reason: NextOrderReason;
  /** Payment-related reasons only: the payment staff act on, and its amount. */
  paymentPublicId: string | null;
  amount: number | null;
  /** Epoch ms of the signal the order is ranked by (the oldest one first). */
  signalAt: number;
};

type Picked = Omit<NextOrderRow, "reason" | "paymentPublicId" | "amount" | "signalAt"> & {
  id: bigint;
  rank: number;
  signal: number;
};

/**
 * The one ranking, shared by every query here so the card and its cycle cannot diverge. Each branch
 * names its rank (lower first) and the signal time that breaks ties (oldest first).
 */
function ranking(today: string) {
  const overdueBefore = requestNow() - OVERDUE_DAYS * DAY_MS;
  const payExists = (where: SQL) =>
    sql`exists (select 1 from ${payments} where ${payments.orderId} = ${orders.id} and ${where})`;
  const payMin = (where: SQL) =>
    sql`(select min(${payments.createdAt}) from ${payments} where ${payments.orderId} = ${orders.id} and ${where})`;
  const openPayment = (where: SQL): SQL => and(isNull(payments.addonRequest), where)!;
  const verify = openPayment(eq(payments.status, "pending_verification"));
  const overdue = openPayment(and(eq(payments.status, "awaiting_payment"), lt(payments.createdAt, overdueBefore))!);
  const pending = openPayment(paymentStatusIn(PENDING));
  const missedAt = sql`(select extract(epoch from min(${deliveries.deliveryDate})) * 1000 from ${deliveries} where ${deliveries.orderId} = ${orders.id} and ${missedWhere(today, "all")})`;
  const branches: { when: SQL; rank: number; signal: SQL }[] = [
    { when: payExists(verify), rank: 0, signal: payMin(verify) },
    { when: payExists(overdue), rank: 1, signal: payMin(overdue) },
    { when: hasMissedDeliveries(today), rank: 2, signal: missedAt },
    { when: sql`${orders.lookOutAt} is not null`, rank: 3, signal: sql`${orders.lookOutAt}` },
    { when: payExists(pending), rank: 4, signal: payMin(pending) },
  ];
  const rank = sql`(case ${sql.join(branches.map((b) => sql`when ${b.when} then ${sql.raw(String(b.rank))}`), sql` `)} else ${sql.raw(String(NO_REASON))} end)`;
  const signal = sql`cast(coalesce(case ${sql.join(branches.map((b) => sql`when ${b.when} then ${b.signal}`), sql` `)} end, 0) as double precision)`;
  return { rank, signal, order: [rank, signal, orders.id] as const };
}

function queueWhere(scope: OrderQueueScope, rank: SQL) {
  return and(
    orderStatusIn(ONGOING),
    ordersListWhere(scope.condition, scope.visible),
    sql`${rank} < ${NO_REASON}`,
  );
}

const isEmptyScope = (scope: OrderQueueScope) => scope.visible !== "all" && scope.visible.length === 0;

async function pick(scope: OrderQueueScope, today: string, cursor: SQL | undefined, dir: "asc" | "desc", limit: number): Promise<NextOrderRow[]> {
  const { rank, signal, order } = ranking(today);
  const rows: Picked[] = await db
    .select({
      id: orders.id,
      publicId: orders.publicId,
      code: orders.deploymentId,
      customerName: orders.fullName,
      phone: users.phone,
      planName: plans.name,
      mealSizeName: mealSizes.name,
      status: orders.status,
      rank: sql<number>`${rank}`,
      signal: sql<number>`${signal}`,
    })
    .from(orders)
    .innerJoin(plans, eq(plans.id, orders.planId))
    .innerJoin(mealSizes, eq(mealSizes.id, orders.mealSizeId))
    .leftJoin(users, eq(users.id, orders.userId))
    .where(and(queueWhere(scope, rank), cursor))
    .orderBy(...order.map((p) => sql`${p} ${sql.raw(dir)}`))
    .limit(limit);
  return hydrate(rows);
}

async function hydrate(picked: Picked[]): Promise<NextOrderRow[]> {
  if (picked.length === 0) return [];
  const open = await db
    .select({ orderId: payments.orderId, publicId: payments.publicId, amount: payments.amount, status: payments.status })
    .from(payments)
    .where(and(inArray(payments.orderId, picked.map((p) => p.id)), isNull(payments.addonRequest), paymentStatusIn(PENDING)))
    .orderBy(payments.createdAt, payments.id);
  return picked.map((p) => {
    const reason = REASON_BY_RANK[p.rank];
    const wanted: PaymentStatus | null = reason === "verify" ? "pending_verification" : reason === "overdue" || reason === "pending" ? "awaiting_payment" : null;
    const pay = wanted ? open.find((r) => r.orderId === p.id && r.status === wanted) : undefined;
    return {
      publicId: p.publicId,
      code: p.code,
      customerName: p.customerName,
      phone: p.phone,
      planName: p.planName,
      mealSizeName: p.mealSizeName,
      status: p.status,
      reason,
      paymentPublicId: pay?.publicId ?? null,
      amount: pay ? Number(pay.amount) : null,
      signalAt: p.signal,
    };
  });
}

/** The order the card recommends next, or the one after/before `cursor` in that order (wrapping round). */
export async function nextOrder(
  scope: OrderQueueScope,
  today: string,
  cursor?: { publicId: string; dir: "next" | "prev" },
): Promise<NextOrderRow | null> {
  if (isEmptyScope(scope)) return null;
  if (!cursor) return (await pick(scope, today, undefined, "asc", 1))[0] ?? null;
  const { rank, signal } = ranking(today);
  const at = sql`(select ${rank}, ${signal}, ${orders.id} from ${orders} where ${orders.publicId} = ${cursor.publicId})`;
  const row = sql`(${rank}, ${signal}, ${orders.id})`;
  const asc = cursor.dir !== "prev";
  const others = sql`${orders.publicId} <> ${cursor.publicId}`;
  const [after] = await pick(scope, today, and(others, sql`${row} ${sql.raw(asc ? ">" : "<")} ${at}`), asc ? "asc" : "desc", 1);
  if (after) return after;
  const [wrapped] = await pick(scope, today, others, asc ? "asc" : "desc", 1);
  return wrapped ?? null;
}

/** One order from the queue by its publicId, or null when it has no reason (or is out of scope). */
export async function queueOrder(scope: OrderQueueScope, today: string, publicId: string): Promise<NextOrderRow | null> {
  if (isEmptyScope(scope)) return null;
  const [row] = await pick(scope, today, eq(orders.publicId, publicId), "asc", 1);
  return row ?? null;
}

/** The `limit` orders after `afterPublicId` in nextOrder's order, wrapping to the top at the end. Never repeats it. */
export async function upNextOrders(scope: OrderQueueScope, today: string, afterPublicId: string, limit: number): Promise<NextOrderRow[]> {
  if (isEmptyScope(scope)) return [];
  const { rank, signal } = ranking(today);
  const at = sql`(select ${rank}, ${signal}, ${orders.id} from ${orders} where ${orders.publicId} = ${afterPublicId})`;
  const row = sql`(${rank}, ${signal}, ${orders.id})`;
  const after = await pick(scope, today, sql`${row} > ${at}`, "asc", limit);
  if (after.length >= limit) return after;
  const before = await pick(scope, today, sql`${row} < ${at}`, "asc", limit - after.length);
  return [...after, ...before];
}

/** How many orders in the scope have any reason to act. */
export async function orderQueueCount(scope: OrderQueueScope, today: string): Promise<number> {
  if (isEmptyScope(scope)) return 0;
  const { rank } = ranking(today);
  const [row] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(queueWhere(scope, rank));
  return row?.count ?? 0;
}
