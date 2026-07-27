import { Suspense } from "react";
import { PackageIcon } from "lucide-react";
import { formatMoney } from "@realm/commons";
import {
  PageHeader,
  PageShell,
  SectionCard,
  parseFilterState,
  type FacetDef,
} from "@realm/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { ordersService, type OrderSortColumn } from "@/lib/services/orders.service";
import { OrdersTable, OrdersTableSkeleton } from "./orders-table";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | undefined>>;

const ORDER_SORT_COLUMNS = [
  "customer",
  "status",
  "total",
  "created",
  "paidAt",
] as const satisfies readonly OrderSortColumn[];

// Facet spec — server-authored so parseFilterState (server) and ReuiFacetFilters
// (client) stay in lockstep. Payment facets resolve via subquery on `payments`.
const SPEC: FacetDef[] = [
  {
    kind: "pills",
    field: "status",
    label: "Status",
    options: [
      { value: "pending", label: "Pending" },
      { value: "paid", label: "Paid" },
      { value: "fulfilled", label: "Fulfilled" },
      { value: "cancelled", label: "Cancelled" },
      { value: "failed", label: "Failed" },
    ],
  },
  {
    kind: "pills",
    field: "paymentStatus",
    label: "Payment",
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
    field: "paymentMethod",
    label: "Method",
    options: [
      { value: "clover", label: "Clover" },
      { value: "cash", label: "Cash" },
      { value: "simulated", label: "Simulated" },
    ],
  },
  { kind: "dateRange", field: "createdAt", label: "Created" },
  { kind: "search", fields: ["publicId", "customerName", "customerEmail"] },
];

export default function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        icon={PackageIcon}
        title="Orders"
        subtitle="Pickup orders settled via Clover."
      />
      <SectionCard title="All orders">
        <Suspense fallback={<OrdersTableSkeleton />}>
          <OrdersData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function OrdersData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const sp = await searchParams;
  const sort = parseSort(sp, ORDER_SORT_COLUMNS, { column: "created", dir: "desc" });
  const { condition, page } = parseFilterState(SPEC, sp);

  const result = await ordersService.queryOrders(condition, page, sort);

  return (
    <OrdersTable
      spec={SPEC}
      rows={result.items.map((r) => ({
        ...r,
        totalLabel: formatMoney(Number(r.total)),
      }))}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
    />
  );
}
