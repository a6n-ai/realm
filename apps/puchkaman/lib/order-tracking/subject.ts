import type { TrackingSubject } from "@foundry/order-tracking";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";

/**
 * Minimal lookup for the Better Auth tracking plugin: just enough to decide
 * access. Queries the table directly rather than going through
 * `ordersService`, which reaches back into the session layer and would make
 * `lib/auth` import a module that imports `lib/auth`.
 */
export async function resolveTrackingSubject(orderId: string): Promise<TrackingSubject | null> {
  const [row] = await db
    .select({ phone: orders.customerPhone, userId: orders.userId })
    .from(orders)
    .where(eq(orders.publicId, orderId))
    .limit(1);

  if (!row) return null;
  return { phone: row.phone, ownerUserId: row.userId?.toString() ?? null };
}
