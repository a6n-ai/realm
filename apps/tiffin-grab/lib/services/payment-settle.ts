import { and, eq, inArray } from "drizzle-orm";
import { NotFoundError } from "@foundry/commons";
import { db } from "@/db/client";
import { orders, payments, type PaymentProof } from "@/db/schema";
import { claimPayment, verifyPayment } from "./orders.service";

/** The order's payment that still needs money: awaiting or previously rejected. */
export async function findUnpaidPayment(orderPublicId: string): Promise<string> {
  const [pay] = await db
    .select({ publicId: payments.publicId })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(eq(orders.publicId, orderPublicId), inArray(payments.status, ["awaiting_payment", "rejected"])))
    .limit(1);
  if (!pay) throw new NotFoundError("No unpaid payment on this order");
  return pay.publicId;
}

/**
 * Staff already hold the customer's payment screenshot when creating the order:
 * record it as the claim and approve it in one go, so the plan starts now
 * instead of waiting in Payments → Requests. Callers MUST requireStaff first.
 */
export async function settleWithStaffProof(
  paymentPublicId: string,
  input: { proof: PaymentProof; reference?: string | null },
  actor: { internalId: bigint | null; publicId: string | null },
): Promise<void> {
  await claimPayment(paymentPublicId, { reference: input.reference ?? null, proof: input.proof }, actor.internalId);
  await verifyPayment(paymentPublicId, { actorId: actor.publicId });
}
