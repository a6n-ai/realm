// Canonical statuses the package reasons about; apps map these onto their own payments enum.
export type PaymentLifecycle =
  | "awaiting_payment"
  | "pending_verification"
  | "paid"
  | "rejected"
  | "refunded";

// A customer may (re)submit a claim while the order is unpaid or after a rejection.
export function canClaim(status: PaymentLifecycle): boolean {
  return status === "awaiting_payment" || status === "rejected";
}

// Staff may verify only a submitted-but-unconfirmed claim.
export function canVerify(status: PaymentLifecycle): boolean {
  return status === "pending_verification";
}
