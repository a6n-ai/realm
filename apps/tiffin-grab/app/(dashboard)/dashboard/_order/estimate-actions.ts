"use server";

import { ValidationError } from "@foundry/commons";
import { createShortLink } from "@foundry/shortlinks";
import { db } from "@/db/client";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { quoteQuery } from "@/lib/wizard/selections";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { assertOrderVisible } from "@/lib/services/orders.service";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { findRenewableOrder, readOrderPrefill } from "@/lib/services/order-prefill.service";
import { userIdByPublicId } from "@/lib/services/session-service";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { orderFormCatalog } from "../orders/order-form-catalog";
import type { CustomerHit } from "../_leads/match-actions";
import type { OrderFormInput } from "./order-schema";

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
export async function createQuoteLink(query: string): Promise<ActionResult<{ code: string }>> {
  return staffAction({ guard: "staff" }, async () => {
    const qs = quoteQuery(new URLSearchParams(query));
    if (!qs) throw new ValidationError("Nothing to link to yet");
    const publicId = (await getSession())?.user?.id;
    const staffId = publicId ? await userIdByPublicId(publicId) : null;
    return { code: await createShortLink(db, { target: `/subscribe${qs}`, createdBy: staffId }) };
  });
}

/**
 * Renewals → Estimate: the ending plan as estimate defaults, read from the order on the server. No start
 * date (an estimate has none) and no codes. A trial leaves meal size empty: trial sizes are not sold as
 * a regular plan, so staff pick the size the customer moves to.
 */
export async function estimatePrefill(orderPublicId: string): Promise<ActionResult<OrderPrefill>> {
  return staffAction({ guard: { order: ["read"] } }, async () => {
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
  return staffAction({ guard: { order: ["read"] } }, async () => {
    const visible = await resolveSessionVisibleOrgIds(await getSession());
    if (visible !== "all" && visible.length === 0) throw new ValidationError("This customer has no earlier plan you can see");
    const last = await findRenewableOrder(customerPublicId, visible);
    if (!last) throw new ValidationError("This customer has no earlier plan to renew");
    return { ...(await prefillFromOrder(last.publicId)), deploymentId: last.deploymentId };
  });
}

type OrderPrefill = { customer: CustomerHit; prefill: Partial<OrderFormInput>; addressPublicId: string | null };

async function prefillFromOrder(orderPublicId: string): Promise<OrderPrefill> {
    const o = await readOrderPrefill(orderPublicId);
    if (!o) throw new ValidationError("This order has no customer account to estimate for");
    const trial = o.trialLength != null;
    const { addons } = o;
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
