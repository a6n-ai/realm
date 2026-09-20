import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { listPayments } from "../payment-queries";
import { PaymentsTable, PaymentsTableSkeleton } from "../payments-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function AllPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PaymentsTableSkeleton />}>
      <AllPaymentsData searchParams={searchParams} />
    </Suspense>
  );
}

async function AllPaymentsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { rows, sort } = await listPayments(await searchParams);
  return <PaymentsTable rows={rows} sort={sort} />;
}
