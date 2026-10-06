import { Suspense } from "react";
import { SectionCard } from "@foundry/design-system";
import { PENDING_PAYMENTS_SPEC } from "../payment-facets";
import { PaymentsData, type SearchParams } from "../payments-data";
import { PaymentsTableSkeleton } from "../payments-table";

export default function PendingPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard title="Pending verification" subtitle="Families say they paid. Check the money arrived, then verify or reject.">
      <Suspense fallback={<PaymentsTableSkeleton />}>
        <PaymentsData
          spec={PENDING_PAYMENTS_SPEC}
          searchParams={searchParams}
          status="pending_verification"
          emptyMessage="Nothing waiting. Claimed payments show up here."
        />
      </Suspense>
    </SectionCard>
  );
}
