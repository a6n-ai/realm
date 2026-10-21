import { SectionCard } from "@/components/ds";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { listPayments } from "../payment-queries";
import { PaymentKpis } from "../payment-kpis";
import { PaymentsTable, PaymentsTableSkeleton } from "../payments-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function AllPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PaymentKpis searchParams={searchParams} />
      <SectionCard title="All payments">
        <Suspense fallback={<PaymentsTableSkeleton />}>
          <AllPaymentsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </>
  );
}

async function AllPaymentsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { rows, total, page, size, sort } = await listPayments(await searchParams);
  return <PaymentsTable rows={rows} total={total} page={page} size={size} sort={sort} />;
}
