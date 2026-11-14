import { planPaymentSql } from "@/lib/payments/status-sql";
import { and, eq } from "drizzle-orm";
import { NotFoundError, ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { deliveries, orders, payments } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/roles";
import { REJECTED } from "@/lib/payments/status";
import { currentUserId } from "@/lib/services/session-service";
import { isPaymentReviewStatus } from "./display-status";

// Staff (admin or member) may manage ANY customer order/delivery; a plain customer only their own.
async function callerIsStaff(): Promise<boolean> {
  const session = await getSession();
  return session != null && isStaffRole(session.user.role);
}

// Passes if the caller is staff, or owns the order. Not-owned and not-existent both throw the same
// NotFoundError — no existence oracle for another customer's data.
export async function assertCanManageOrder(orderPublicId: string): Promise<void> {
  if (await callerIsStaff()) return;
  const userId = await currentUserId();
  if (userId == null) throw new NotFoundError("Subscription not found");
  await assertOwnsOrder(userId, orderPublicId);
}

export async function assertCanManageDelivery(deliveryPublicId: string): Promise<void> {
  if (await callerIsStaff()) return;
  const userId = await currentUserId();
  if (userId == null) throw new NotFoundError("Delivery not found");
  await assertOwnsDelivery(userId, deliveryPublicId);
}

// True while any payment on the order is unconfirmed (awaiting, under review, or rejected and
// awaiting a re-claim). Used to freeze customer schedule changes until staff approve.
export async function orderPaymentLocked(orderPublicId: string): Promise<boolean> {
  const rows = await db
    .select({ status: payments.status })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(eq(orders.publicId, orderPublicId), planPaymentSql));
  return rows.some((r) => isPaymentReviewStatus(r.status) || r.status === REJECTED);
}

// A customer's plan is read-only until payment is confirmed (meal picks included); staff can always act.
export async function assertOrderUnlocked(orderPublicId: string): Promise<void> {
  if (await callerIsStaff()) return;
  if (await orderPaymentLocked(orderPublicId)) {
    throw new ValidationError("You can edit your plan once we confirm your payment.");
  }
}

// Ownership guards for customer server actions that delegate to admin mutations without their own check.
// Not-owned and not-existent throw the same NotFoundError: no existence oracle.
export async function assertOwnsDelivery(userId: bigint, deliveryPublicId: string): Promise<void> {
  const [row] = await db
    .select({ ownerId: orders.userId })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(eq(deliveries.publicId, deliveryPublicId))
    .limit(1);
  if (!row || row.ownerId !== userId) throw new NotFoundError("Delivery not found");
}

export async function assertOwnsOrder(userId: bigint, orderPublicId: string): Promise<void> {
  const [row] = await db
    .select({ ownerId: orders.userId })
    .from(orders)
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  if (!row || row.ownerId !== userId) throw new NotFoundError("Subscription not found");
}
