import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { customerAddresses, deliveryFrequencies, mealSizes, orderAddons, orders, plans, users } from "@/db/schema";

/** The customer's most recent plan (cancelled ones skipped) inside the visible organizations. */
export async function findRenewableOrder(customerPublicId: string, visible: "all" | string[]) {
  const [last] = await db
    .select({ publicId: orders.publicId, deploymentId: orders.deploymentId })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(and(
      eq(users.publicId, customerPublicId),
      ne(orders.status, "cancelled"),
      visible === "all" ? undefined : inArray(orders.organizationId, visible),
    ))
    .orderBy(desc(orders.startDate), desc(orders.createdAt))
    .limit(1);
  return last ?? null;
}

/** An order's plan, size, frequency, address and add-ons as the inputs an estimate or renewal starts from. */
export async function readOrderPrefill(orderPublicId: string) {
  const [o] = await db
    .select({
      userPublicId: users.publicId,
      fullName: users.name,
      phone: users.phone,
      email: users.email,
      planKey: plans.key,
      mealSizeId: mealSizes.publicId,
      frequencyKey: deliveryFrequencies.key,
      eatingDays: orders.eatingDays,
      persons: orders.persons,
      mealSlots: orders.mealSlots,
      includeSaturday: orders.includeSaturday,
      includeSunday: orders.includeSunday,
      durationWeeks: orders.durationWeeks,
      trialLength: orders.trialLength,
      addressLine: orders.addressLine,
      city: orders.city,
      postalCode: orders.postalCode,
      orderId: orders.id,
      // Only a still-saved address can be re-picked; an archived one falls back to the typed fields.
      addressPublicId: customerAddresses.publicId,
    })
    .from(orders)
    .leftJoin(customerAddresses, and(eq(orders.addressId, customerAddresses.id), isNull(customerAddresses.archivedAt)))
    .innerJoin(users, eq(orders.userId, users.id))
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  if (!o) return null;
  // A trial has no add-ons and leaves the size empty, so nothing to carry.
  const addons = o.trialLength != null ? [] : await db
    .select({ key: orderAddons.addonKey, qty: orderAddons.qty })
    .from(orderAddons)
    .where(eq(orderAddons.orderId, o.orderId))
    .orderBy(asc(orderAddons.addonKey));
  return { ...o, addons };
}
