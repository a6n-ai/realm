"use server";

import { RUNNING_OR_DONE, inOrderStatuses } from "@/lib/orders/status";
import { revalidateOrder } from "@/lib/revalidate";
import { ValidationError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { stripePayLink } from "@/lib/payments/stripe";
import { assertOrderVisible } from "@/lib/services/orders.service";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { assertOnePerson, createOrder } from "@/lib/services/create-order";
import { defaultPaymentMethodId, findUnpaidRenewal, loadQuickRenewForOrder, loadRenewContext, loadRenewSourceSelections } from "@/lib/services/quick-renew.service";
import type { QuickRenewData } from "@/lib/renewals/quick-renew-types";
import type { WizardSelections } from "@/lib/wizard/selections";
import { runAction, type ActionResult } from "@/lib/actions/action-result";
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
    if (await findUnpaidRenewal(src)) throw new ValidationError("This customer already has a renewal waiting for payment. Open it to resend the pay link or cancel it.");
    if (!inOrderStatuses(RUNNING_OR_DONE, src.status)) throw new ValidationError("Only an active, paused or completed plan can be renewed.");
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
    const paymentMethodId = await defaultPaymentMethodId(src.sourceMethodId);
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
    revalidateOrder(input.orderPublicId, { orderList: true });
    return { ...result, payUrl: await stripePayLink(result.paymentPublicId) };
  });
}
