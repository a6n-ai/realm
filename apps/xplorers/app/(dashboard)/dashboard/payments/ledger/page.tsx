import { Suspense } from "react";
import { ArrowDownLeftIcon, ArrowUpRightIcon, ScaleIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { parseFilterState, SectionCard, StatGrid, type FacetDef } from "@foundry/design-system";
import { LEDGER_DIRECTIONS, LEDGER_ENTRY_TYPES } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { formatAppWhen } from "@/lib/app-clock";
import { parseSort } from "@/lib/list/sort";
import { getAppClock } from "@/lib/services/app-settings.service";
import { ledgerService } from "@/lib/services/ledger.service";
import type { SearchParams } from "../payments-data";
import { LedgerTable, LedgerTableSkeleton } from "./ledger-table";

const SORT_COLUMNS = ["time", "amount"] as const;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const SPEC: FacetDef[] = [
  { kind: "pills", field: "type", label: "Type", options: LEDGER_ENTRY_TYPES.map((t) => ({ value: t, label: capitalize(t) })) },
  {
    kind: "pills",
    field: "direction",
    label: "Direction",
    options: LEDGER_DIRECTIONS.map((d) => ({ value: d, label: d === "credit" ? "In" : "Out" })),
  },
  { kind: "dateRange", field: "createdAt", label: "Date" },
  { kind: "search", fields: ["name", "email"] },
];

export default function PaymentsLedgerPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard title="Ledger" subtitle="Append-only money entries. Totals follow the filters.">
      <Suspense fallback={<LedgerTableSkeleton />}>
        <LedgerData searchParams={searchParams} />
      </Suspense>
    </SectionCard>
  );
}

async function LedgerData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const sort = parseSort(sp, SORT_COLUMNS, { column: "time", dir: "desc" });
  const { condition, page } = parseFilterState(SPEC, sp);
  const [{ timezone, currency }, result, totals] = await Promise.all([
    getAppClock(),
    ledgerService.listPage(condition, page, sort),
    ledgerService.totals(condition),
  ]);

  return (
    <div className="grid gap-4">
      <StatGrid
        cols={3}
        items={[
          { label: "In", value: formatMoney(Number(totals.credit), currency), icon: ArrowDownLeftIcon },
          { label: "Out", value: formatMoney(Number(totals.debit), currency), icon: ArrowUpRightIcon },
          { label: "Net", value: formatMoney(Number(totals.net), currency), icon: ScaleIcon },
        ]}
      />
      <LedgerTable
        spec={SPEC}
        rows={result.items.map((r) => ({ ...r, whenLabel: formatAppWhen(r.createdAt, timezone) }))}
        total={result.total}
        page={page.page}
        size={page.size}
        sort={sort}
      />
    </div>
  );
}
