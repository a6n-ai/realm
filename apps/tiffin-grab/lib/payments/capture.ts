import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { orderActivities, payments } from "@/db/schema";
import { ledgerService } from "@/lib/payments/ledger.service";

type CapturedPayment = { id: bigint; method: string; amount: string; surchargeAmount: string | null };
type CaptureOrder = { id: bigint; userId: bigint; organizationId: string | null };

/** Money arrived: mark the payment paid, credit the ledger (surcharge included), log the verification. */
export async function markPaymentCaptured(
  tx: Tx,
  pay: CapturedPayment,
  order: CaptureOrder,
  opts: { createdBy?: bigint | null; providerEventId?: string | null } = {},
): Promise<void> {
  const surcharge = Number(pay.surchargeAmount ?? 0);
  await ledgerService.record(tx, {
    userId: order.userId,
    orderId: order.id,
    paymentId: pay.id,
    direction: "credit",
    type: "payment",
    amount: (Number(pay.amount) + surcharge).toFixed(2),
    memo: surcharge > 0 ? `incl. card surcharge ${pay.surchargeAmount}` : null,
    providerEventId: opts.providerEventId ?? null,
  });
  await tx.update(payments).set({ status: "paid", capturedAt: Date.now() }).where(eq(payments.id, pay.id));
  await tx.insert(orderActivities).values({
    orderId: order.id,
    type: "payment_verified",
    note: `${pay.method} · ${pay.amount}`,
    createdBy: opts.createdBy,
    organizationId: order.organizationId,
  });
}
