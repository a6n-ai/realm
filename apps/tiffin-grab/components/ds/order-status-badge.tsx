import { Badge } from "@foundry/ui/badge";

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  upcoming: "Active",
  waitlisted: "Waitlisted",
  paused: "Active",
  cancelled: "Cancelled",
  completed: "Over",
  // Derived (not an orders.status enum value) — unpaid e-Transfer/cash overlay.
  payment_review: "Payment review",
  rejected: "Rejected",
};
type Variant = "neutral" | "ok" | "warn" | "bad";
export const ORDER_STATUS_VARIANT: Record<string, Variant> = {
  pending: "neutral",
  active: "ok",
  upcoming: "ok",
  waitlisted: "warn",
  paused: "ok",
  cancelled: "bad",
  completed: "neutral",
  payment_review: "warn",
  rejected: "bad",
};
const VARIANT_TONE: Record<Variant, string> = {
  neutral: "",
  ok: "[--ui-badge-tone:var(--ok)]",
  warn: "[--ui-badge-tone:var(--warn)]",
  bad: "[--ui-badge-tone:var(--bad)]",
};

export function OrderStatusBadge({ status }: { status: string }) {
  const v = ORDER_STATUS_VARIANT[status] ?? "neutral";
  return (
    <Badge variant="neutral" className={VARIANT_TONE[v]}>
      {ORDER_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
