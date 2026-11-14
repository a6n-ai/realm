"use server";

import { revalidateOrder } from "@/lib/revalidate";
import { revalidatePath } from "next/cache";
import { NotFoundError } from "@foundry/commons";
import { claimPayment, getClaimPaymentContext, type ClaimPaymentContext } from "@/lib/payments/verification";
import { uploadPaymentProof } from "@/lib/payments/payment-proof";
import { assertCanManageOrder, assertOwnsOrder } from "@/lib/deliveries/customer-deliveries.service";
import { currentUserId } from "@/lib/services/session-service";
import { requireCustomerId } from "@/lib/account/customer";
import { runAction, type ActionResult } from "@/lib/actions/action-result";
import { emailOrderReceipt } from "@/lib/billing/email-receipt";

async function assertCanClaimPayment(paymentPublicId: string): Promise<ClaimPaymentContext> {
  const ctx = await getClaimPaymentContext(paymentPublicId);
  if (!ctx) throw new NotFoundError("Payment not found");
  await assertCanManageOrder(ctx.orderPublicId);
  return ctx;
}

export async function claimPaymentAction(paymentPublicId: string, form: FormData): Promise<ActionResult> {
  return runAction(() => claimPaymentUnsafe(paymentPublicId, form));
}

async function claimPaymentUnsafe(paymentPublicId: string, form: FormData) {
  const ctx = await assertCanClaimPayment(paymentPublicId);
  const reference = String(form.get("reference") ?? "").trim() || null;
  const proof = await uploadPaymentProof(
    paymentPublicId,
    form.get("proof"),
    form.get("proof_thumb"),
  );
  await claimPayment(paymentPublicId, { reference, proof }, await currentUserId());
  revalidatePath("/me");
  revalidatePath("/me/wallet");
  revalidateOrder(ctx.orderPublicId, { orderList: true });
  revalidatePath("/dashboard/payments/requests");
}

export async function loadClaimPaymentContext(paymentPublicId: string): Promise<ClaimPaymentContext> {
  return assertCanClaimPayment(paymentPublicId);
}

export async function emailReceiptAction(orderPublicId: string): Promise<ActionResult> {
  return runAction(async () => {
    const userId = await requireCustomerId(new NotFoundError("Order not found"));
    await assertOwnsOrder(userId, orderPublicId);
    await emailOrderReceipt(orderPublicId);
  });
}
