import type { ReactNode } from "react";
import { Info } from "lucide-react";
import type { SubSummary } from "@/lib/services/customer-deliveries.service";

/** Soft hint shown in wizard steps when the customer already has a live plan. */
export type CurrentPlanSummary = Pick<
  SubSummary,
  "planName" | "mealSizeName" | "daysPerWeek" | "status" | "startDate"
>;

export function CurrentPlanHint({ children }: { children: ReactNode }) {
  return (
    // A quiet footnote, not a tinted block: it's context, not a warning.
    <p className="text-muted-foreground flex items-start gap-2 text-[13px] text-pretty">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
