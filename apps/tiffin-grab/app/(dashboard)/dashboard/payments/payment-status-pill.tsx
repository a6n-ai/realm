import { cn } from "@foundry/ui/cn";

const LABEL: Record<string, string> = {
  simulated_paid: "Paid",
  paid: "Paid",
  pending: "Pending",
  awaiting_payment: "Awaiting payment",
  pending_verification: "Needs review",
  rejected: "Rejected",
  refunded: "Refunded",
};
const TONE: Record<string, string> = {
  simulated_paid: "bg-ok/15 text-ok",
  paid: "bg-ok/15 text-ok",
  pending_verification: "bg-warn/15 text-warn",
  awaiting_payment: "bg-muted text-muted-foreground border",
  pending: "bg-muted text-muted-foreground border",
  rejected: "bg-bad/15 text-bad",
  refunded: "bg-bad/15 text-bad",
};

export function PaymentStatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {LABEL[status] ?? status}
    </span>
  );
}
