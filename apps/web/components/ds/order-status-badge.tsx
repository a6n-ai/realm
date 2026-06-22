import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", active: "Active", waitlisted: "Waitlisted", paused: "Paused", cancelled: "Cancelled",
};
type Variant = "neutral" | "ok" | "warn" | "bad";
const STATUS_VARIANT: Record<string, Variant> = {
  pending: "neutral", active: "ok", waitlisted: "warn", paused: "warn", cancelled: "bad",
};
const VARIANT_CLASS: Record<Variant, string> = {
  neutral: "bg-muted text-muted-foreground border",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
};

export function OrderStatusBadge({ status }: { status: string }) {
  const v = STATUS_VARIANT[status] ?? "neutral";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", VARIANT_CLASS[v])}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
