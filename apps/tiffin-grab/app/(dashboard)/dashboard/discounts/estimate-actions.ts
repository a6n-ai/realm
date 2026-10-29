"use server";

import { eq } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { createShortLink } from "@foundry/shortlinks";
import { db } from "@/db/client";
import { deliveryFrequencies, mealSizes, orders, plans, users } from "@/db/schema";
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
export async function estimatePrefill(orderPublicId: string): Promise<ActionResult<{ customer: CustomerHit; prefill: Partial<OrderFormInput> }>> {
  return runAction(async () => {
    await requirePermission({ order: ["read"] });
    await assertOrderVisible(orderPublicId, await resolveSessionVisibleOrgIds(await getSession()));
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
      })
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .innerJoin(plans, eq(orders.planId, plans.id))
      .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
      .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
      .where(eq(orders.publicId, orderPublicId))
      .limit(1);
    if (!o) throw new ValidationError("This order has no customer account to estimate for");
    const trial = o.trialLength != null;
    return {
      customer: { publicId: o.userPublicId, fullName: o.fullName, phone: o.phone, email: o.email },
      prefill: {
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
  });
}
