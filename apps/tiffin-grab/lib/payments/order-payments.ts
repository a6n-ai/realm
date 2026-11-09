import { and, desc, inArray, isNull } from "drizzle-orm";
import type { db } from "@/db/client";
import { payments } from "@/db/schema";
import { PAID, inStatuses } from "./status";

/** The plan's own payments per order, newest first: an add-on request is not part of what the plan was paid. */
export async function orderPaymentStatuses(exec: Pick<typeof db, "select">, orderIds: bigint[]): Promise<Map<bigint, string[]>> {
  const map = new Map<bigint, string[]>();
  if (orderIds.length === 0) return map;
  const rows = await exec
    .select({ orderId: payments.orderId, status: payments.status })
    .from(payments)
    .where(and(inArray(payments.orderId, orderIds), isNull(payments.addonRequest)))
    .orderBy(desc(payments.createdAt), desc(payments.id));
  for (const r of rows) {
    const list = map.get(r.orderId) ?? [];
    list.push(r.status);
    map.set(r.orderId, list);
  }
  return map;
}

/** The status that shows the plan was paid (money confirmed on any of its payments), else null. */
export const paidStatusOf = (statuses: readonly string[] | undefined): string | null =>
  statuses?.find((s) => inStatuses(PAID, s)) ?? null;
