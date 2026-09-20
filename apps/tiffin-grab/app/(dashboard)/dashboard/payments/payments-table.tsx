"use client";

import Link from "next/link";
import { ReceiptTextIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { TableCell } from "@foundry/ui/table";
import { DataTable, type Column } from "@/components/ds";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import type { FacetDef } from "@/components/ds";
import { PaymentStatusPill } from "./payment-status-pill";
import { PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_OPTIONS, type PaymentRow, type PaymentSortKey } from "./payment-facets";
import type { SortState } from "@/lib/list/sort";

const COLUMNS: readonly Column<PaymentSortKey>[] = [
  { key: "time", label: "Time", sortable: true },
  { key: "customer", label: "Customer", sortable: true },
  { key: "order", label: "Order", sortable: true },
  { key: "method", label: "Method", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "amount", label: "Amount", sortable: true, align: "right" },
];

const SPEC: FacetDef[] = [
  { kind: "multi", field: "status", label: "Status", options: [...PAYMENT_STATUS_OPTIONS] },
  { kind: "multi", field: "method", label: "Method", options: [...PAYMENT_METHOD_OPTIONS] },
  { kind: "search", fields: [] },
];

export function PaymentsTable({ rows, sort }: { rows: PaymentRow[]; sort: SortState<PaymentSortKey> }) {
  const tz = useTimezone();
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.publicId}
      sort={sort}
      filters={<ListSearchFilters spec={SPEC} placeholder="Search order, customer, reference…" shortPlaceholder="Search…" />}
      emptyIcon={ReceiptTextIcon}
      emptyMessage="No payments yet."
      renderRow={(r) => (
        <>
          <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
            {formatEpoch(r.createdAt, { mode: "datetime", timeZone: tz })}
          </TableCell>
          <TableCell className="text-muted-foreground">{r.email ?? "-"}</TableCell>
          <TableCell>
            <Link href={`/dashboard/orders/${r.orderPublicId}`} className="hover:underline">
              {r.orderPublicId}
            </Link>
          </TableCell>
          <TableCell className="capitalize">{r.method}</TableCell>
          <TableCell>
            <PaymentStatusPill status={r.status} />
          </TableCell>
          <TableCell className="text-right tabular-nums">{formatMoney(Number(r.amount))}</TableCell>
        </>
      )}
    />
  );
}

export function PaymentsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
