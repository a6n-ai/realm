import { Suspense } from "react";
import { SectionCard } from "@/components/ds";
import { loadSuppressedAddresses, SUPPRESSED_SPEC } from "@/lib/notifications/logs-query";
import { SuppressedTable, SuppressedTableSkeleton } from "../suppressed-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function SuppressedAddressesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard
      title="Suppressed addresses"
      subtitle="Bounced, complained or unsubscribed addresses — no send is attempted against these until cleared."
    >
      <Suspense fallback={<SuppressedTableSkeleton />}>
        <SuppressedAddressesData searchParams={searchParams} />
      </Suspense>
    </SectionCard>
  );
}

async function SuppressedAddressesData({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { rows, sort, total, page, size } = await loadSuppressedAddresses(sp);
  return <SuppressedTable spec={SUPPRESSED_SPEC} rows={rows} sort={sort} total={total} page={page} size={size} />;
}
