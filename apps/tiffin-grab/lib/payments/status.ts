import type { payments } from "@/db/schema";

export type PaymentStatus = (typeof payments.status.enumValues)[number];

/** Money confirmed (simulated_paid is the no-payment-rail checkout path). */
export const PAID = ["paid", "simulated_paid"] as const;
/**
 * Money that came in at some point. A full refund flips the payment to 'refunded' and also writes a ledger
 * refund row; revenue counts every captured payment and subtracts the ledger, so a refunded payment must
 * stay in the gross side or its refund would be deducted from nothing.
 */
export const CAPTURED = [...PAID, "refunded"] as const;
/** Staff still has to confirm money. */
export const PENDING = ["awaiting_payment", "pending_verification"] as const;
/** Customer still owes: an open link or a rejected claim. */
export const UNPAID = ["awaiting_payment", "rejected"] as const;
/** A provider confirmation or manual verify may still settle these. */
export const SETTLEABLE = ["awaiting_payment", "pending_verification", "rejected"] as const;

export const inStatuses = (list: readonly PaymentStatus[], status: string | null | undefined) =>
  status != null && (list as readonly string[]).includes(status);
