"use server";

import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { createShortLink } from "@foundry/shortlinks";
import { db } from "@/db/client";
import { customerAddresses, deliveryFrequencies, mealSizes, orderAddons, orders, plans, users } from "@/db/schema";
import { requirePermission, requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { quoteQuery } from "@/components/wizard/selections";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { assertOrderVisible, resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { orderFormCatalog } from "../orders/order-form-catalog";
import type { CustomerHit } from "../_leads/match-actions";
import type { OrderFormInput } from "../inquiries/[id]/order-schema";

// Loaded when the estimate opens: the Create coupon dialog sits on every dashboard page.
export async function estimateFormData() {
  await requireStaff();
  const [catalog, slots, { currency }] = await Promise.all([
    loadCatalogSnapshot(),
    dishCategoriesService.enabledCategories(),
    getAppSettings(),
  ]);
  return {
    catalog: orderFormCatalog(catalog),
    enabledSlots: slots.map((s) => ({ key: s.key, label: s.label })),
    currency,
  };
}

// The short /q/ link for an estimate. Only the quote params are kept, so the stored target is
// always the subscribe stepper; created_by is the signed-in staff member, never client input.
export async function createQuoteLink(query: string): Promise<{ code: string } | { error: string }> {
  await requireStaff();
  const qs = quoteQuery(new URLSearchParams(query));
  if (!qs) return { error: "Nothing to link to yet" };
  const publicId = (await getSession())?.user?.id;
  const [staff] = publicId ? await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1) : [];
  try {
    return { code: await createShortLink(db, { target: `/subscribe${qs}`, createdBy: staff?.id ?? null }) };
  } catch {
    return { error: "Couldn't create a short link" };
  }
}

/**
 * Renewals → Estimate: the ending plan as estimate defaults, read from the order on the server. No start
 * date (an estimate has none) and no codes. A trial leaves meal size empty: trial sizes are not sold as
 * a regular plan, so staff pick the size the customer moves to.
 */
export async function estimatePrefill(orderPublicId: string): Promise<ActionResult<OrderPrefill>> {
  return runAction(async () => {
    await requirePermission({ order: ["read"] });
    await assertOrderVisible(orderPublicId, await resolveSessionVisibleOrgIds(await getSession()));
    return prefillFromOrder(orderPublicId);
  });
}

/**
 * New order → Renew last plan: the customer's most recent plan (cancelled ones skipped) that this
 * staff member can see, as order defaults with its add-ons and saved address. No start date: the
 * form's renewal rule starts it the day after the running plan ends.
 */
export async function renewPrefill(customerPublicId: string): Promise<ActionResult<OrderPrefill & { deploymentId: string }>> {
  return runAction(async () => {
    await requirePermission({ order: ["read"] });
    const visible = await resolveSessionVisibleOrgIds(await getSession());
    if (visible !== "all" && visible.length === 0) throw new ValidationError("This customer has no earlier plan you can see");
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
    if (!last) throw new ValidationError("This customer has no earlier plan to renew");
    return { ...(await prefillFromOrder(last.publicId)), deploymentId: last.deploymentId };
  });
}

type OrderPrefill = { customer: CustomerHit; prefill: Partial<OrderFormInput>; addressPublicId: string | null };

async function prefillFromOrder(orderPublicId: string): Promise<OrderPrefill> {
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
    if (!o) throw new ValidationError("This order has no customer account to estimate for");
    const trial = o.trialLength != null;
    // A trial has no add-ons and leaves the size empty, so nothing to carry.
    const addons = trial ? [] : await db
      .select({ key: orderAddons.addonKey, qty: orderAddons.qty })
      .from(orderAddons)
      .where(eq(orderAddons.orderId, o.orderId))
      .orderBy(asc(orderAddons.addonKey));
    return {
      customer: { publicId: o.userPublicId, fullName: o.fullName, phone: o.phone, email: o.email },
      addressPublicId: o.addressPublicId ?? null,
      prefill: {
        ...(addons.length ? { addonSelections: addons } : {}),
        planKey: o.planKey,
        ...(trial ? {} : { mealSizeId: o.mealSizeId, durationWeeks: o.durationWeeks }),
        frequencyKey: o.frequencyKey,
        ...(o.eatingDays?.length ? { eatingDays: o.eatingDays as OrderFormInput["eatingDays"] } : {}),
        persons: o.persons,
        mealSlots: o.mealSlots,
        includeSaturday: o.includeSaturday,
        includeSunday: o.includeSunday,
        addressLine: o.addressLine,
        city: o.city,
        postalCode: o.postalCode,
      },
    };
}
