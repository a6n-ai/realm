import { SectionCard } from "@/components/ds";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { loadOwnerOptions } from "@/lib/list/facet-options";
import { UNASSIGNED_OWNER } from "@/lib/list/presets";
import { listPayments } from "../payment-queries";
import { PaymentsTop } from "../payment-kpis";
import { PaymentsTable, PaymentsTableSkeleton } from "../payments-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function AllPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PaymentsTop tab="all" searchParams={searchParams} />
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
  const ownerOptions = [{ value: UNASSIGNED_OWNER, label: "Unassigned" }, ...(await loadOwnerOptions())];
  const { rows, total, page, size, sort } = await listPayments(await searchParams);
  return <PaymentsTable ownerOptions={ownerOptions} rows={rows} total={total} page={page} size={size} sort={sort} />;
}
