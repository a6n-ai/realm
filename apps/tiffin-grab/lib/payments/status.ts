import type { payments } from "@/db/schema";

export type PaymentStatus = (typeof payments.status.enumValues)[number];

/** Staff wording for each stored status, used by tables, filters, exports and revenue. */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "Paid",
  simulated_paid: "Simulated",
  awaiting_payment: "Awaiting payment",
  pending_verification: "Needs review",
  pending: "Pending",
  rejected: "Rejected",
  refunded: "Refunded",
};

export const paymentStatusLabel = (status: string): string => PAYMENT_STATUS_LABEL[status as PaymentStatus] ?? status;

/** `expiresAt` of an add-on link that was cancelled or replaced: it can never be applied. */
export const VOID_EXPIRY = 0;
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
/** Staff rejected the claim; customer must start a new order (hidden from /me lists). */
export const REJECTED = "rejected" as const;
/** Customer still owes: an open link or a rejected claim. */
export const UNPAID = ["awaiting_payment", "rejected"] as const;
/** A provider confirmation or manual verify may still settle these. */
export const SETTLEABLE = ["awaiting_payment", "pending_verification", "rejected"] as const;

export const inStatuses = (list: readonly PaymentStatus[], status: string | null | undefined) =>
  status != null && (list as readonly string[]).includes(status);
