import { RUNNING } from "@/lib/orders/status";
import { orderStatusIn } from "@/lib/orders/status-sql";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";

/** Customers with a running plan: the people who have meals to pick. */
export async function activeCustomers() {
  const rows = await db
    .selectDistinct({ userId: users.id, name: users.name })
    .from(users)
    .innerJoin(orders, eq(orders.userId, users.id))
    .where(and(orderStatusIn(RUNNING), eq(users.status, "active")));
  return rows.map((r) => ({ userId: r.userId, name: r.name }));
}
