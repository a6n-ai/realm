import { SectionCard } from "@/components/ds";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { payments } from "@/db/schema";
import { MarkSectionRead } from "@/components/dashboard/mark-section-read";
import { loadOwnerOptions } from "@/lib/list/facet-options";
import { UNASSIGNED_OWNER } from "@/lib/list/presets";
import { listPayments } from "../payment-queries";
import { PaymentsTop } from "../payment-kpis";
import { RequestsTable, RequestsTableSkeleton } from "./requests-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function RequestsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PaymentsTop tab="etransfer" searchParams={searchParams} />
      <SectionCard title="E-transfers">
        <Suspense fallback={<RequestsTableSkeleton />}>
          <MarkSectionRead section="payments" />
          <RequestsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </>
  );
}

// Every e-transfer, any status. "Needs review" = the customer says they sent it; nothing
// settles until staff approve, so those rows carry Approve/Reject.
async function RequestsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const ownerOptions = [{ value: UNASSIGNED_OWNER, label: "Unassigned" }, ...(await loadOwnerOptions())];
  const { rows, total, page, size, sort } = await listPayments(await searchParams, {
    where: eq(payments.method, "etransfer"),
  });
  return <RequestsTable ownerOptions={ownerOptions} rows={rows} total={total} page={page} size={size} sort={sort} />;
}
