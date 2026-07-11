import { NotFoundError, weekdayKey } from "@realm/commons";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, menuWeeks, orders, plans } from "@/db/schema";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import { resolveDeliveryMeal, type ResolvedCategory } from "@/lib/menu/resolve-delivery-meal";

type Delivery = typeof deliveries.$inferSelect;
export type CustomerDelivery = Delivery & { orderPublicId: string; planName: string; isMakeup: boolean };
export type Subscription = {
  publicId: string;
  planName: string;
  status: string;
  fullName: string;
  addressLine: string;
  city: string;
  postalCode: string;
  zoneId: bigint | null;
};

const VISIBLE = ["scheduled", "paused", "skipped"] as const;

export async function myActiveSubscriptions(userId: bigint): Promise<Subscription[]> {
  return db
    .select({
      publicId: orders.publicId,
      planName: plans.name,
      status: orders.status,
      fullName: orders.fullName,
      addressLine: orders.addressLine,
      city: orders.city,
      postalCode: orders.postalCode,
      zoneId: orders.zoneId,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(and(eq(orders.userId, userId), inArray(orders.status, ["active", "paused"])));
}

// Scoped to orders.userId = userId: a customer only ever sees their own delivery
// rows here, across every subscription they own. Cancelled deliveries are
// filtered by delivery status, not order status — cancelOrder() marks every
// affected row cancelled directly, so no separate orders.status check is needed.
export async function myDeliveries(userId: bigint, from: string, until: string): Promise<CustomerDelivery[]> {
  const rows = await db
    .select({ d: deliveries, orderPublicId: orders.publicId, planName: plans.name })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(
      and(
        eq(orders.userId, userId),
        inArray(deliveries.status, [...VISIBLE]),
        gte(deliveries.deliveryDate, from),
        lte(deliveries.deliveryDate, until),
      ),
    )
    .orderBy(asc(deliveries.deliveryDate));
  return rows.map((r) => ({
    ...r.d,
    orderPublicId: r.orderPublicId,
    planName: r.planName,
    isMakeup: r.d.makeupForDeliveryId !== null,
  }));
}

// Ownership guards: called by customer server actions BEFORE delegating to
// shared admin mutations that have no ownership check of their own. Not-owned
// and not-existent both throw the same NotFoundError — never a distinct
// forbidden error, so there is no existence oracle for another user's data.
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

// Pure read: resolves "what's coming" for one delivery against the released menu_week for its
// plan/week. Never calls reconcileMakeups/materializeDeliveries — those are write paths reached
// only through the admin/cron flows, not from a customer-facing lookup.
export async function myDeliveryMeal(d: CustomerDelivery, person = 1): Promise<ResolvedCategory[] | { pending: true }> {
  const [order] = await db
    .select({ id: orders.id, planId: orders.planId, planType: plans.planType })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(eq(orders.publicId, d.orderPublicId))
    .limit(1);
  if (!order) return { pending: true };

  const weekStart = mondayOfIso(d.deliveryDate);
  const [week] = await db
    .select({ id: menuWeeks.id })
    .from(menuWeeks)
    .where(and(eq(menuWeeks.planType, order.planType), eq(menuWeeks.weekStart, weekStart), eq(menuWeeks.status, "released")))
    .limit(1);
  if (!week) return { pending: true };

  // delivery_date is a calendar date; explicit-UTC parse (the mandatory `Z`) is required to
  // derive its weekday, or local-midnight parsing shifts the day (spec-6 bug).
  const dayOfWeek = weekdayKey(new Date(`${d.deliveryDate}T00:00:00Z`));
  return resolveDeliveryMeal({ id: order.id, planId: order.planId }, { id: week.id }, dayOfWeek, person);
}
