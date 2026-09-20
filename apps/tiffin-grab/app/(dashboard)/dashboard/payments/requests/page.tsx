import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { and } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { payments } from "@/db/schema";
import { listPayments } from "../payment-queries";
import { RequestsTable, RequestsTableSkeleton } from "./requests-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function RequestsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<RequestsTableSkeleton />}>
      <RequestsData searchParams={searchParams} />
    </Suspense>
  );
}

// "Needs review" = the customer says they sent it; nothing settles until staff approve.
async function RequestsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { rows, sort } = await listPayments(await searchParams, {
    where: and(eq(payments.status, "pending_verification"), eq(payments.method, "etransfer")),
  });
  return <RequestsTable rows={rows} sort={sort} />;
}
