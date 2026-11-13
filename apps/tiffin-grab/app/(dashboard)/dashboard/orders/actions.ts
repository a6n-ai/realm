"use server";

import { ValidationError } from "@foundry/commons";
import { currentUserId } from "@/lib/services/session-service";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orderActivities, orders } from "@/db/schema";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { assertOrderVisible, ordersService } from "@/lib/services/orders.service";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import type { CreateOrderInput } from "@/lib/services/create-order";
import type { ActionResult } from "@/lib/actions/action-result";
import { orderAction } from "@/lib/actions/order-action";
import { parseInput, staffAction, type Guard } from "@/lib/actions/staff-action";
import { getSession } from "@/lib/auth/session";
import { uploadPaymentProof } from "@/lib/services/payment-proof";
import { stripePayLink } from "@/lib/payments/stripe";
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

/** The lead both New-order steps resolve: email is the login path, so it is required. */
async function resolveOrderLead(input: {
  source: Source;
  contact: Contact;
  interest?: Interest;
  pickedInquiryId?: string;
}): Promise<{ inquiryId: string; email: string }> {
  const email = input.contact.email?.trim();
  if (!email) throw new ValidationError("Email is required");
  const inquiryId = await inquiriesService.resolveForSource({
    phone: input.contact.phone,
    sourceKey: input.source.sourceKey,
    contact: { fullName: input.contact.fullName, email },
    interest: { ...input.interest, subSourceKey: input.source.subSourceKey },
    pickedId: input.pickedInquiryId,
    visible: await resolveSessionVisibleOrgIds(await getSession()),
  });
  return { inquiryId, email };
}

// Step 1 of New order: save (or reuse) the lead so it is searchable in
// Inquiries even if the order is never finished. Create converts this inquiry;
// the customer, order and payment are only written there.
export async function saveOrderLeadAction(input: {
  source: Source;
  contact: Contact;
  pickedInquiryId?: string;
  /** false: skip the page refresh (see createOrderFlow's revalidate). */
  revalidate?: boolean;
}): Promise<ActionResult<{ inquiryId: string }>> {
  const opts = input.revalidate === false ? { guard: "staff" as const } : { guard: "staff" as const, revalidate: ["/dashboard/inquiries"] };
  return staffAction(opts, async () => ({ inquiryId: (await resolveOrderLead(input)).inquiryId }));
}

export async function createOrderFlow(input: {
  source: Source;
  contact: Contact;
  interest?: Interest;
  pickedInquiryId?: string;
  order: CreateOrderInput;
  /**
   * false: skip the page refresh. New order shows its result inside the Orders page's Suspense
   * boundary, which a refresh can remount mid-success; it refreshes the list when it closes instead.
   */
  revalidate?: boolean;
}): Promise<ActionResult<{ publicId: string; deploymentId: string; paymentPublicId: string; payUrl: string | null }>> {
  const opts = input.revalidate === false
    ? { guard: "staff" as const }
    : { guard: "staff" as const, revalidate: ["/dashboard/orders", "/dashboard/inquiries"] };
  return staffAction(opts, async () => {
    const { inquiryId, email } = await resolveOrderLead(input);
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
    return { ...result, payUrl: await stripePayLink(result.paymentPublicId) };
  });
}

// Staff already have the customer's e-Transfer screenshot at order creation:
// attach it and approve the payment so the plan starts right away.
// FormData: proof (image), proof_thumb (image), reference (optional).
export async function settleNewOrderWithProofAction(orderPublicId: string, form: FormData): Promise<ActionResult> {
  return orderAction({ order: orderPublicId, orderPage: orderPublicId, reach: { orderList: true, payments: true } }, async () => {
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
}

// Optional, staff-clicked: emails the customer a sign-in link to pay this new order.
// A Stripe order passes its paymentPublicId (the link is that payment's page); others default to the order's unpaid payment.
export async function emailPaymentLinkAction(orderPublicId: string, paymentPublicId?: string): Promise<ActionResult> {
  return orderAction({ order: orderPublicId, orderPage: orderPublicId }, async () => {
    await sendPaymentReminder(orderPublicId, paymentPublicId ?? (await findUnpaidPayment(orderPublicId)), await currentUserId());
  });
}

const ORDER_WRITE: Guard = { order: ["write"] };

const orderNoteSchema = z.string().trim().min(1, "Write a note first").max(2000, "Keep the note under 2000 characters");

// Staff note on the order's activity log, from the Next order card. The author comes from the session.
export async function addOrderNoteAction(orderPublicId: string, note: string): Promise<ActionResult> {
  return staffAction({ guard: ORDER_WRITE, revalidate: [`/dashboard/orders/${orderPublicId}`] }, async () => {
    await assertOrderVisible(orderPublicId, await resolveSessionVisibleOrgIds(await getSession()));
    const text = parseInput(orderNoteSchema, note);
    const [order] = await db
      .select({ id: orders.id, organizationId: orders.organizationId })
      .from(orders)
      .where(eq(orders.publicId, orderPublicId))
      .limit(1);
    if (!order) throw new ValidationError("Order not found");
    await db.insert(orderActivities).values({
      orderId: order.id,
      type: "note",
      note: text,
      createdBy: await currentUserId(),
      organizationId: order.organizationId,
    });
  });
}

export async function reassignOrderAction(orderId: string, ownerId: string): Promise<ActionResult> {
  return staffAction({ guard: "staff", revalidate: ["/dashboard/orders"] }, async () => {
    await ordersService.reassign(orderId, ownerId);
  });
}

// Switch-over day: every WordPress plan still waiting starts from `fromDate` (or its own later
// next-due date). Admin only: it schedules deliveries for every migrated customer at once.
export async function startAllMigratedAction(
  fromDate: string,
): Promise<ActionResult<{ started: number; failed: { deploymentId: string; error: string }[] }>> {
  return staffAction({ guard: "admin", revalidate: ["/dashboard/orders"] }, () => ordersService.startAllMigrated(fromDate));
}
