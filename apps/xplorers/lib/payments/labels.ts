export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting",
  pending_verification: "Pending",
  paid: "Paid",
  rejected: "Rejected",
  refunded: "Refunded",
};

export function paymentBadgeVariant(status: string): "default" | "destructive" | "outline" {
  return status === "paid" ? "default" : status === "rejected" ? "destructive" : "outline";
}
