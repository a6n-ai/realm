import { cn } from "@realm/ui/cn";

export const CATEGORY_LABEL: Record<string, string> = {
  order: "Order",
  billing: "Billing",
  catering: "Catering",
  general: "General",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_customer: "Waiting on customer",
  resolved: "Resolved",
  closed: "Closed",
};

type Variant = "neutral" | "ok" | "warn" | "bad";

const VARIANT_CLASS: Record<Variant, string> = {
  neutral: "bg-muted text-muted-foreground border",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
};

const STATUS_VARIANT: Record<string, Variant> = {
  open: "warn",
  in_progress: "ok",
  waiting_on_customer: "neutral",
  resolved: "ok",
  closed: "neutral",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const PRIORITY_VARIANT: Record<string, Variant> = {
  low: "neutral",
  normal: "neutral",
  high: "warn",
  urgent: "bad",
};

function Pill({ variant, children }: { variant: Variant; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        VARIANT_CLASS[variant],
      )}
    >
      {children}
    </span>
  );
}

export function TicketStatusBadge({ status }: { status: string }) {
  return (
    <Pill variant={STATUS_VARIANT[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</Pill>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Pill variant={PRIORITY_VARIANT[priority] ?? "neutral"}>
      {PRIORITY_LABEL[priority] ?? priority}
    </Pill>
  );
}
