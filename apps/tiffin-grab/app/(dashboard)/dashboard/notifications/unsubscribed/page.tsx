import { Suspense } from "react";
import { SectionCard } from "@/components/ds";
import { loadSuppressedAddresses, suppressionSummary, SUPPRESSED_SPEC } from "@/lib/notifications/logs-query";
import { SuppressedTable, SuppressedTableSkeleton } from "../logs/suppressed-table";
import { ManualSuppress } from "./suppression-actions";

type SearchParams = Promise<Record<string, string | undefined>>;
const LABELS = { unsubscribe: "Unsubscribed", bounce: "Bounced", complaint: "Complained", manual: "Blocked by staff" } as const;

export default async function UnsubscribedPage({ searchParams }: { searchParams: SearchParams }) {
  const [summary, sp] = await Promise.all([suppressionSummary(), searchParams]);
  const query = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1])).toString();
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((k) => (
          <div key={k} className="bg-card rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">{LABELS[k]}</p>
            <p className="text-3xl font-semibold tabular-nums">{summary.total[k].toLocaleString()}</p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {summary.thisMonth[k]} this month · {summary.last30[k]} in 30 days
            </p>
          </div>
        ))}
      </div>
      <SectionCard
        title="Unsubscribed and suppressed"
        subtitle="No marketing is sent to these addresses. An unsubscribe can only be reversed by the recipient."
        action={
          <div className="flex items-center gap-3">
            <a className="text-sm underline underline-offset-2" href={`/api/notifications/unsubscribed/export?${query}`}>
              Export CSV
            </a>
            <ManualSuppress />
          </div>
        }
      >
        <Suspense fallback={<SuppressedTableSkeleton />}>
          <Rows searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function Rows({ searchParams }: { searchParams: SearchParams }) {
  const { rows, sort, total, page, size } = await loadSuppressedAddresses(await searchParams);
  return <SuppressedTable spec={SUPPRESSED_SPEC} rows={rows} sort={sort} total={total} page={page} size={size} />;
}
