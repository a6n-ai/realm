import { requirePagePermission } from "@/lib/auth/guards";
import { Suspense } from "react";
import { loadSuppressedAddresses, suppressionSummary, SUPPRESSED_SPEC } from "@/lib/notifications/logs-query";
import { SuppressedTable, SuppressedTableSkeleton } from "../logs/suppressed-table";
import { UnsubscribedChrome } from "./unsubscribed-chrome";

type SearchParams = Promise<Record<string, string | undefined>>;
export default async function UnsubscribedPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePagePermission({ notification: ["read"] });
  // Not left to the layout: a layout is not re-run on client navigation.
  const [summary, sp] = await Promise.all([suppressionSummary(), searchParams]);
  const query = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1])).toString();
  return (
    <UnsubscribedChrome
      summary={summary}
      query={query}
      list={
        <Suspense fallback={<SuppressedTableSkeleton />}>
          <Rows searchParams={searchParams} />
        </Suspense>
      }
    />
  );
}

async function Rows({ searchParams }: { searchParams: SearchParams }) {
  const { rows, sort, total, page, size } = await loadSuppressedAddresses(await searchParams);
  return <SuppressedTable spec={SUPPRESSED_SPEC} rows={rows} sort={sort} total={total} page={page} size={size} />;
}
