"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { stripePayLink } from "@/lib/payments/stripe";
import { assertOrderVisible, createOrder, resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { loadQuickRenewForOrder, loadRenewContext } from "@/lib/services/quick-renew.service";
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
    const result = await createOrder(
      {
        addressPublicId,
        selections: input.selections,
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
