import { Suspense } from "react";
import { formatMoney } from "@realm/commons";
import { SectionCard, parseFilterState, type FacetDef } from "@realm/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { ledgerService, type LedgerSortColumn } from "@/lib/services/ledger.service";
import { LedgerTable, LedgerTableSkeleton } from "./ledger-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const LEDGER_SORT_COLUMNS = [
  "created",
  "type",
  "direction",
  "amount",
  "customer",
] as const satisfies readonly LedgerSortColumn[];

const SPEC: FacetDef[] = [
  {
    kind: "pills",
    field: "direction",
    label: "Direction",
    options: [
      { value: "credit", label: "Credit" },
      { value: "debit", label: "Debit" },
    ],
  },
  {
    kind: "pills",
    field: "type",
    label: "Type",
    options: [
      { value: "payment", label: "Payment" },
      { value: "refund", label: "Refund" },
      { value: "discount", label: "Discount" },
      { value: "adjustment", label: "Adjustment" },
    ],
  },
  { kind: "dateRange", field: "createdAt", label: "Created" },
  {
    kind: "search",
    fields: ["publicId", "orderPublicId", "customerName", "customerEmail", "memo"],
  },
];

export default function FinanceLedgerPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard title="Ledger">
      <Suspense fallback={<LedgerTableSkeleton />}>
        <LedgerData searchParams={searchParams} />
      </Suspense>
    </SectionCard>
  );
}

async function LedgerData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ finance: ["read"] });

  const sp = await searchParams;
  const sort = parseSort(sp, LEDGER_SORT_COLUMNS, { column: "created", dir: "desc" });
  const { condition, page } = parseFilterState(SPEC, sp);

  const result = await ledgerService.queryLedger(condition, page, sort);

  return (
    <LedgerTable
      spec={SPEC}
      rows={result.items.map((r) => ({
        ...r,
        amountLabel: formatMoney(Number(r.amount)),
      }))}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
    />
  );
}
