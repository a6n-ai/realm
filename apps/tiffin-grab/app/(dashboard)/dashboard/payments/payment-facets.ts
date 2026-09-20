// Client-safe: imported by both the server queries and the "use client" tables. Never import db here.
export type PaymentRow = {
  publicId: string;
  createdAt: number;
  status: string;
  method: string;
  amount: string;
  reference: string | null;
  proofThumb: string | null;
  note: string | null;
  email: string | null;
  orderPublicId: string;
};

export const PAYMENT_SORT_KEYS = ["time", "customer", "order", "method", "status", "amount"] as const;
export type PaymentSortKey = (typeof PAYMENT_SORT_KEYS)[number];

export const PAYMENT_STATUS_OPTIONS = [
  { value: "pending_verification", label: "Needs review" },
  { value: "awaiting_payment", label: "Awaiting payment" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
  { value: "refunded", label: "Refunded" },
] as const;

export const PAYMENT_METHOD_OPTIONS = [
  { value: "etransfer", label: "e-Transfer" },
  { value: "cash", label: "Cash" },
  { value: "manual", label: "Manual" },
  { value: "simulated", label: "Simulated" },
] as const;

export const LEDGER_SORT_KEYS = ["time", "customer", "type", "order", "amount"] as const;
export type LedgerSortKey = (typeof LEDGER_SORT_KEYS)[number];

export const LEDGER_TYPE_OPTIONS = [
  { value: "payment", label: "Payment" },
  { value: "refund", label: "Refund" },
  { value: "discount", label: "Discount" },
  { value: "adjustment", label: "Adjustment" },
] as const;

export const LOG_SORT_KEYS = ["time", "event", "order", "by"] as const;
export type LogSortKey = (typeof LOG_SORT_KEYS)[number];

export const LOG_EVENT_OPTIONS = [
  { value: "payment_claimed", label: "Customer claimed" },
  { value: "payment_verified", label: "Staff approved" },
  { value: "payment_rejected", label: "Staff rejected" },
] as const;
