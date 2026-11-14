import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { AuthError } from "@foundry/commons";
import { db } from "@/db/client";
import { mealSizes, orders, payments, plans, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { currentUserId } from "@/lib/services/session-service";

// Actions throw (each caller keeps the error it surfaced before); pages redirect to /login.

export async function requireCustomer(err: Error = new AuthError()) {
  const session = await getSession();
  if (!session?.user) throw err;
  return session.user;
}

export async function requireCustomerId(err: Error = new AuthError()): Promise<bigint> {
  const id = await currentUserId();
  if (id == null) throw err;
  return id;
}

export async function requireCustomerSession(callbackUrl?: string) {
  const session = await getSession();
  if (!session?.user) redirect(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
  return session;
}

export async function requireCustomerIdOrRedirect(): Promise<bigint> {
  const id = await currentUserId();
  if (id == null) redirect("/login");
  return id;
}

export async function ownsPayment(paymentPublicId: string, userPublicId: string): Promise<boolean> {
  const [owned] = await db
    .select({ id: payments.id })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(eq(payments.publicId, paymentPublicId), eq(users.publicId, userPublicId)))
    .limit(1);
  return !!owned;
}

export async function findOwnedPayment(paymentPublicId: string, userPublicId: string) {
  const [row] = await db
    .select({ pay: payments, order: orders, meal: mealSizes.name, plan: plans.name })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .innerJoin(mealSizes, eq(mealSizes.id, orders.mealSizeId))
    .innerJoin(plans, eq(plans.id, orders.planId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(eq(payments.publicId, paymentPublicId), eq(users.publicId, userPublicId)))
    .limit(1);
  return row;
}

export async function ownedOrderId(orderPublicId: string, userId: bigint): Promise<bigint | undefined> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.publicId, orderPublicId), eq(orders.userId, userId)))
    .limit(1);
  return row?.id;
}
