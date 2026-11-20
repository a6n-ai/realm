import type { ReactNode } from "react";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { PaymentsTabs } from "./payments-tabs";

/** Same order as Orders and Renewals: the date range and the cards it moves, then the tabs. */
export function PaymentsFrame({ stats }: { stats: ReactNode }) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SectionDateRange />
        </div>
        {stats}
      </div>
      <PaymentsTabs />
    </>
  );
}
