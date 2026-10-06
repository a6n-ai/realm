import { Suspense } from "react";
import { BanIcon, CalendarIcon, CircleDollarSignIcon, HourglassIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { SectionCard, StatGrid } from "@foundry/design-system";
import { Skeleton } from "@foundry/ui/skeleton";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppClock } from "@/lib/services/app-settings.service";
import { paymentsService } from "@/lib/services/payments.service";
import { ALL_PAYMENTS_SPEC } from "../payment-facets";
import { PaymentsData, type SearchParams } from "../payments-data";
import { PaymentsTableSkeleton } from "../payments-table";

export default function AllPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="grid gap-6">
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <PaymentStats />
      </Suspense>
      <SectionCard title="All payments">
        <Suspense fallback={<PaymentsTableSkeleton />}>
          <PaymentsData
            spec={ALL_PAYMENTS_SPEC}
            searchParams={searchParams}
            emptyMessage="No payments yet. Activate Payments and enable a method to collect booking fees."
          />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function PaymentStats() {
  await requireAdmin();
  const [s, { currency }] = await Promise.all([paymentsService.paymentStats(), getAppClock()]);
  return (
    <StatGrid
      cols={4}
      items={[
        { label: "Paid", value: formatMoney(Number(s.paidTotal), currency), icon: CircleDollarSignIcon },
        { label: "Pending", value: String(s.pending), icon: HourglassIcon },
        { label: "Rejected", value: String(s.rejected), icon: BanIcon },
        { label: "This week", value: String(s.thisWeek), icon: CalendarIcon },
      ]}
    />
  );
}
