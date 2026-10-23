"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { enabledMethods } from "@foundry/payments";
import { stripeMethodAvailable, stripePayLink } from "@/lib/payments/stripe";
import { getPaymentConfig } from "@/lib/services/app-settings.service";
import { assertOnePerson, assertOrderVisible, createOrder, resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { loadQuickRenewForOrder, loadRenewContext, loadRenewSourceSelections } from "@/lib/services/quick-renew.service";
import type { QuickRenewData } from "@/components/renew/types";
import type { WizardSelections } from "@/components/wizard/selections";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import type { AdminOrderCreated } from "../admin-order-created-dialog";

async function guard(orderPublicId: string) {
  await requirePermission({ order: ["write"] });
  const session = await getSession();
  await assertOrderVisible(orderPublicId, await resolveSessionVisibleOrgIds(session));
  return session;
}

export async function loadRenewAction(orderPublicId: string): Promise<ActionResult<{ data: QuickRenewData | null }>> {
  return runAction(async () => {
    await guard(orderPublicId);
    return { data: await loadQuickRenewForOrder(orderPublicId) };
  });
}

/** Staff renewal: creates the order and its unpaid payment; the customer pays on the link, or staff attach proof after. */
export async function renewOrderAction(input: {
  orderPublicId: string;
  selections: WizardSelections;
  addressPublicId: string | null;
}): Promise<ActionResult<AdminOrderCreated>> {
  return runAction(async () => {
    const session = await guard(input.orderPublicId);
    const src = await loadRenewContext(input.orderPublicId);
    if (!src) throw new ValidationError("Order not found");
    if (src.trialLength != null) throw new ValidationError("A trial can't be quick-renewed. Use New order.");
    const addressPublicId = input.addressPublicId ?? src.addressPublicId;
    if (!addressPublicId) throw new ValidationError("Pick a delivery address");
    if (!src.phone) throw new ValidationError("This customer has no phone number. Use New order.");
    const c = input.selections;
    const base = await loadRenewSourceSelections(input.orderPublicId, c.startDate);
    if (!base) throw new ValidationError("This plan can't be quick-renewed. Use New order.");
    // Only these come from the client; plan, size, days and persons are the source order's.
    const selections: WizardSelections = {
      ...base,
      startDate: c.startDate,
      durationWeeks: c.durationWeeks,
      addonSelections: c.addonSelections ?? [],
      deliveryTagId: c.deliveryTagId,
      deliveryStrategyIds: c.deliveryStrategyIds,
      addressTagId: c.addressTagId,
    };
    assertOnePerson({ selections });
    // Server picks the rail: card when Stripe is live (the pay link needs it), else the order's own, else the first enabled.
    const enabled = enabledMethods(await getPaymentConfig()).map((m) => m.id);
    const paymentMethodId = (await stripeMethodAvailable()) ? "stripe"
      : src.sourceMethodId && enabled.includes(src.sourceMethodId) ? src.sourceMethodId
      : (enabled[0] ?? null);
    const result = await createOrder(
      {
        addressPublicId,
        paymentMethodId,
        selections,
        planKey: src.planKey,
        contact: {
          fullName: src.ownerName ?? src.fullName,
          phone: src.phone,
          email: src.email,
          addressLine: src.addressLine,
          city: src.city,
          postalCode: src.postalCode,
        },
      },
      { actorId: session?.user?.id ?? null, ownerUserId: src.ownerPublicId, orgId: src.organizationId, staffCreated: true },
    );
    revalidatePath(`/dashboard/orders/${input.orderPublicId}`);
    revalidatePath("/dashboard/orders");
    return { ...result, payUrl: await stripePayLink(result.paymentPublicId) };
  });
}
