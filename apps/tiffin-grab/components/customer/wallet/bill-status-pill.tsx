import { cn } from "@foundry/ui/cn";
import { ORDER_STATUS_LABEL, ORDER_STATUS_VARIANT } from "@/components/ds";

// Customer surfaces keep the pre-Geist pill; admin uses OrderStatusBadge (the shared Badge).
const VARIANT_CLASS = {
  neutral: "bg-muted text-muted-foreground border",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
} as const;

export function BillStatusPill({ status }: { status: string }) {
  const v = ORDER_STATUS_VARIANT[status] ?? "neutral";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", VARIANT_CLASS[v])}>
      {ORDER_STATUS_LABEL[status] ?? status}
    </span>
  );
}
