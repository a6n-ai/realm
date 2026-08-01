"use server";

import { revalidatePath } from "next/cache";
import { NotFoundError } from "@realm/commons";
import {
  claimPayment,
  getClaimPaymentContext,
  type ClaimPaymentContext,
} from "@/lib/services/orders.service";
import { uploadPaymentProof } from "@/lib/services/payment-proof";
import { assertCanManageOrder } from "@/lib/services/customer-deliveries.service";
import { currentUserId } from "@/lib/services/session-service";

async function assertCanClaimPayment(paymentPublicId: string): Promise<ClaimPaymentContext> {
  const ctx = await getClaimPaymentContext(paymentPublicId);
  if (!ctx) throw new NotFoundError("Payment not found");
  await assertCanManageOrder(ctx.orderPublicId);
  return ctx;
}

export async function claimPaymentAction(paymentPublicId: string, form: FormData): Promise<void> {
  await assertCanClaimPayment(paymentPublicId);
  const reference = String(form.get("reference") ?? "").trim() || null;
  const proof = await uploadPaymentProof(
    paymentPublicId,
    form.get("proof"),
    form.get("proof_thumb"),
  );
  await claimPayment(paymentPublicId, { reference, proof }, await currentUserId());
  revalidatePath("/me/wallet");
  revalidatePath("/dashboard/orders");
}

export async function loadClaimPaymentContext(paymentPublicId: string): Promise<ClaimPaymentContext> {
  return assertCanClaimPayment(paymentPublicId);
}
