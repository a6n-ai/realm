import { Badge } from "@foundry/ui/badge";
import { paymentStatusLabel } from "@/lib/payments/status";

const TONE: Record<string, string> = {
  simulated_paid: "[--ui-badge-tone:var(--ok)]",
  paid: "[--ui-badge-tone:var(--ok)]",
  pending_verification: "[--ui-badge-tone:var(--warn)]",
  awaiting_payment: "",
  pending: "",
  rejected: "[--ui-badge-tone:var(--bad)]",
  refunded: "[--ui-badge-tone:var(--bad)]",
};

export function PaymentStatusPill({ status }: { status: string }) {
  return (
    <Badge variant="neutral" className={TONE[status]}>
      {paymentStatusLabel(status)}
    </Badge>
  );
}
