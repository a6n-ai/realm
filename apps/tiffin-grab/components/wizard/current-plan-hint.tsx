import type { ReactNode } from "react";
import type { SubSummary } from "@/lib/services/customer-deliveries.service";

/** Soft hint shown in wizard steps when the customer already has a live plan. */
export type CurrentPlanSummary = Pick<
  SubSummary,
  "planName" | "mealSizeName" | "daysPerWeek" | "status" | "startDate"
>;

export function CurrentPlanHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl bg-[var(--primary-wash)] px-3 py-2.5 text-sm text-pretty">
      {children}
    </p>
  );
}
