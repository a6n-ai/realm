import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments } from "@/db/schema";
import { isStaffRole } from "@/lib/roles";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { currentUserId } from "@/lib/services/session-service";
import { sees } from "@/lib/tenant/org-scope";

type OrderOwnership = { userId: bigint | null; organizationId: string | null };
type SessionLike = { user: { id: string; role?: string | null; platformRole?: string | null } };

/** The signed-in user is the order's customer. */
export async function ownsOrder(order: OrderOwnership): Promise<boolean> {
  return order.userId != null && order.userId === (await currentUserId());
}

/** Staff may open an order only inside their own organizations; an unscoped order is "all"-only. */
export async function staffSeesOrder(session: SessionLike, order: OrderOwnership): Promise<boolean> {
  if (!isStaffRole(session.user.role)) return false;
  const visible = await resolveSessionVisibleOrgIds(session);
  return visible === "all" || (order.organizationId != null && sees(visible, order.organizationId));
}

export async function loadOrderOwnership(orderPublicId: string): Promise<OrderOwnership | undefined> {
  const [row] = await db.select({ userId: orders.userId, organizationId: orders.organizationId })
    .from(orders).where(eq(orders.publicId, orderPublicId)).limit(1);
  return row;
}

/** The activate page's order + its first payment, or null when missing or not the caller's to see (reads as missing, so ids can't be probed). */
export async function loadActivation(deploymentId: string, session: SessionLike) {
  const [order] = await db.select({
    userId: orders.userId,
    organizationId: orders.organizationId,
    id: orders.id,
    status: orders.status,
    deploymentId: orders.deploymentId,
    latitude: orders.latitude,
    longitude: orders.longitude,
  }).from(orders).where(eq(orders.deploymentId, deploymentId)).limit(1);
  if (!order) return null;
  const owns = await ownsOrder(order);
  if (!owns && !(await staffSeesOrder(session, order))) return null;
  const [payment] = await db
    .select({ publicId: payments.publicId, status: payments.status })
    .from(payments)
    .where(eq(payments.orderId, order.id))
    .limit(1);
  return { order, payment, owns };
}
