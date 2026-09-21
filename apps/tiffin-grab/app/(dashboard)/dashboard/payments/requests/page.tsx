import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { and } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { payments } from "@/db/schema";
import { MarkSectionRead } from "@/components/dashboard/mark-section-read";
import { listPayments } from "../payment-queries";
import { RequestsTable, RequestsTableSkeleton } from "./requests-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function RequestsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<RequestsTableSkeleton />}>
      <MarkSectionRead section="payments" />
      <RequestsData searchParams={searchParams} />
    </Suspense>
  );
}

// "Needs review" = the customer says they sent it; nothing settles until staff approve.
async function RequestsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { rows, total, page, size, sort } = await listPayments(await searchParams, {
    where: and(eq(payments.status, "pending_verification"), eq(payments.method, "etransfer")),
  });
  return <RequestsTable rows={rows} total={total} page={page} size={size} sort={sort} />;
}
