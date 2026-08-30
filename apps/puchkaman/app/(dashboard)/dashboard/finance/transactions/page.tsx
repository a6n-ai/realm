import { Suspense } from "react";
import { formatMoney } from "@realm/commons";
import { SectionCard, parseFilterState, type FacetDef } from "@realm/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { paymentsService, type PaymentSortColumn } from "@/lib/services/payments.service";
import { TransactionsTable, TransactionsTableSkeleton } from "./transactions-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const PAYMENT_SORT_COLUMNS = [
  "customer",
  "status",
  "method",
  "amount",
  "created",
  "capturedAt",
] as const satisfies readonly PaymentSortColumn[];

const SPEC: FacetDef[] = [
  {
    kind: "pills",
    field: "status",
    label: "Status",
    options: [
      { value: "awaiting_payment", label: "Awaiting" },
      { value: "pending_verification", label: "Pending verify" },
      { value: "paid", label: "Paid" },
      { value: "rejected", label: "Rejected" },
      { value: "refunded", label: "Refunded" },
      { value: "failed", label: "Failed" },
    ],
  },
  {
    kind: "pills",
    field: "method",
    label: "Method",
    options: [
      { value: "clover", label: "Clover" },
      { value: "cash", label: "Cash" },
      { value: "simulated", label: "Simulated" },
    ],
  },
  { kind: "dateRange", field: "createdAt", label: "Created" },
  {
    kind: "search",
    fields: ["publicId", "orderPublicId", "customerName", "customerEmail", "cloverChargeId"],
  },
];

export default function FinanceTransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard title="Transactions">
      <Suspense fallback={<TransactionsTableSkeleton />}>
        <TransactionsData searchParams={searchParams} />
      </Suspense>
    </SectionCard>
  );
}

async function TransactionsData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ finance: ["read"] });

  const sp = await searchParams;
  const sort = parseSort(sp, PAYMENT_SORT_COLUMNS, { column: "created", dir: "desc" });
  const { condition, page } = parseFilterState(SPEC, sp);

  const result = await paymentsService.queryPayments(condition, page, sort);

  return (
    <TransactionsTable
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
