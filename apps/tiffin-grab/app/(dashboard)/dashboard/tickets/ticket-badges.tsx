import { Badge } from "@foundry/ui/badge";

// Labels come from the shared taxonomy so admin never drifts from the customer
// picker; categoryLabel() also covers retired values still on historical rows.
export { categoryLabel } from "@/lib/support/ticket-taxonomy";

type Variant = "neutral" | "ok" | "warn" | "bad";

const VARIANT_TONE: Record<Variant, string> = {
  neutral: "",
  ok: "[--ui-badge-tone:var(--ok)]",
  warn: "[--ui-badge-tone:var(--warn)]",
  bad: "[--ui-badge-tone:var(--bad)]",
};

const STATUS_VARIANT: Record<string, Variant> = {
  open: "warn",
  in_progress: "ok",
  waiting_on_customer: "neutral",
  resolved: "ok",
  closed: "neutral",
};

// Labels come from the shared priority vocabulary so the queue, the ticket page
// and complaint analytics never disagree on what a priority is called.
export { priorityLabel } from "@/lib/support/ticket-priority";
import { priorityLabel } from "@/lib/support/ticket-priority";
import { statusLabel } from "@/lib/support/ticket-status";

const PRIORITY_VARIANT: Record<string, Variant> = {
  low: "neutral",
  normal: "neutral",
  high: "warn",
  urgent: "bad",
};

export function TicketStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="neutral" className={VARIANT_TONE[STATUS_VARIANT[status] ?? "neutral"]}>
      {statusLabel(status)}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge variant="neutral" className={VARIANT_TONE[PRIORITY_VARIANT[priority] ?? "neutral"]}>
      {priorityLabel(priority)}
    </Badge>
  );
}
