"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { currentUserId } from "@/lib/services/session-service";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { assertOrderVisible, resolveSessionVisibleOrgIds, reassignOrder, startAllMigratedOrders, type CreateOrderInput } from "@/lib/services/orders.service";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { getSession } from "@/lib/auth/session";
import { uploadPaymentProof } from "@/lib/services/payment-proof";
import { findUnpaidPayment, settleWithStaffProof } from "@/lib/services/payment-settle";
import { sendPaymentReminder } from "@/lib/services/payment-reminder";

type Source = { sourceKey: string; subSourceKey?: string };
type Contact = { fullName: string; phone: string; email: string };
type Interest = {
  planInterest?: string;
  mealSizeInterest?: string;
  personsInterest?: number;
  frequencyKeyInterest?: string;
  eatingDaysInterest?: string[];
  postalCode?: string;
  preferredStart?: string;
  quotedPrice?: number;
};

// Step 1 of New order: save (or reuse) the lead so it is searchable in
// Inquiries even if the order is never finished. Create converts this inquiry;
// the customer, order and payment are only written there.
export async function saveOrderLeadAction(input: {
  source: Source;
  contact: Contact;
  pickedInquiryId?: string;
}): Promise<ActionResult<{ inquiryId: string }>> {
  const res = await runAction(async () => {
    await requireStaff();
    const email = input.contact.email?.trim();
    if (!email) throw new ValidationError("Email is required");
    const inquiryId = await inquiriesService.resolveForSource({
      phone: input.contact.phone,
      sourceKey: input.source.sourceKey,
      contact: { fullName: input.contact.fullName, email },
      interest: { subSourceKey: input.source.subSourceKey },
      pickedId: input.pickedInquiryId,
    });
    return { inquiryId };
  });
  if ("ok" in res) revalidatePath("/dashboard/inquiries");
  return res;
}

export async function createOrderFlow(input: {
  source: Source;
  contact: Contact;
  interest?: Interest;
  pickedInquiryId?: string;
  order: CreateOrderInput;
}): Promise<ActionResult<{ publicId: string; deploymentId: string }>> {
  return runAction(async () => {
    await requireStaff();
    const email = input.contact.email?.trim();
    if (!email) throw new ValidationError("Email is required");
    const inquiryId = await inquiriesService.resolveForSource({
      phone: input.contact.phone,
      sourceKey: input.source.sourceKey,
      contact: { fullName: input.contact.fullName, email },
      interest: { ...input.interest, subSourceKey: input.source.subSourceKey },
      pickedId: input.pickedInquiryId,
    });
    // Custom meals are created by the backend only (2026-10-07); staff orders use catalog sizes.
    const order = input.order;
    const result = await inquiriesService.convert(
      inquiryId,
      {
        ...order,
        contact: { ...order.contact, email },
      },
      { allowAdditionalOrder: true },
    );
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard/inquiries");
    return result;
  });
}

// Staff already have the customer's e-Transfer screenshot at order creation:
// attach it and approve the payment so the plan starts right away.
// FormData: proof (image), proof_thumb (image), reference (optional).
export async function settleNewOrderWithProofAction(orderPublicId: string, form: FormData): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertOrderVisible(orderPublicId, await resolveSessionVisibleOrgIds(await getSession()));
    const [internalId, session] = await Promise.all([currentUserId(), getSession()]);
    const paymentPublicId = await findUnpaidPayment(orderPublicId);
    const proof = await uploadPaymentProof(paymentPublicId, form.get("proof"), form.get("proof_thumb"));
    if (!proof) throw new ValidationError("Attach the payment screenshot");
    const ref = form.get("reference");
    await settleWithStaffProof(
      paymentPublicId,
      { proof, reference: typeof ref === "string" ? ref.trim() || null : null },
      { internalId, publicId: session?.user?.id ?? null },
    );
  });
  if ("ok" in res) {
    revalidatePath("/dashboard/orders");
    revalidatePath(`/dashboard/orders/${orderPublicId}`);
    revalidatePath("/dashboard/payments", "layout");
  }
  return res;
}

// Optional, staff-clicked: emails the customer a sign-in link to pay this new order.
export async function emailPaymentLinkAction(orderPublicId: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertOrderVisible(orderPublicId, await resolveSessionVisibleOrgIds(await getSession()));
    await sendPaymentReminder(orderPublicId, await findUnpaidPayment(orderPublicId), await currentUserId());
  });
  if ("ok" in res) revalidatePath(`/dashboard/orders/${orderPublicId}`);
  return res;
}

export async function reassignOrderAction(orderId: string, ownerId: string): Promise<void> {
  await requireStaff();
  await reassignOrder(orderId, ownerId);
  revalidatePath("/dashboard/orders");
}

// Switch-over day: every WordPress plan still waiting starts from `fromDate` (or its own later
// next-due date). Admin only: it schedules deliveries for every migrated customer at once.
export async function startAllMigratedAction(
  fromDate: string,
): Promise<ActionResult<{ started: number; failed: { deploymentId: string; error: string }[] }>> {
  const res = await runAction(async () => {
    await requireAdmin();
    return startAllMigratedOrders(fromDate);
  });
  revalidatePath("/dashboard/orders");
  return res;
}
