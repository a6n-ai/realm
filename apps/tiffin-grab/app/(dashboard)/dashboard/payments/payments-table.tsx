"use client";

import Link from "next/link";
import { useState } from "react";
import { EyeIcon, ReceiptTextIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { TableCell } from "@foundry/ui/table";
import { DataTable, ListPagination, RowActions, RowActionTooltipButton, type Column } from "@/components/ds";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import type { FacetDef } from "@/components/ds";
import { PaymentStatusPill } from "./payment-status-pill";
import { PaymentDetailDialog } from "./payment-detail-dialog";
import { PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_OPTIONS, type PaymentRow, type PaymentSortKey } from "./payment-facets";
import type { SortState } from "@/lib/list/sort";

const COLUMNS: readonly Column<PaymentSortKey | "actions">[] = [
  { key: "time", label: "Time", sortable: true },
  { key: "customer", label: "Customer", sortable: true },
  { key: "order", label: "Order", sortable: true },
  { key: "method", label: "Method", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "amount", label: "Amount", sortable: true, align: "right" },
  { key: "actions", label: "", align: "right" },
];

const SPEC: FacetDef[] = [
  { kind: "multi", field: "status", label: "Status", options: [...PAYMENT_STATUS_OPTIONS] },
  { kind: "multi", field: "method", label: "Method", options: [...PAYMENT_METHOD_OPTIONS] },
  { kind: "search", fields: [] },
];

export function PaymentsTable({
  rows,
  total,
  page,
  size,
  sort,
}: {
  rows: PaymentRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<PaymentSortKey>;
}) {
  const tz = useTimezone();
  const [viewing, setViewing] = useState<PaymentRow | null>(null);
  return (
    <div className="space-y-4">
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.publicId}
      sort={sort as SortState<PaymentSortKey | "actions">}
      idAccessor={(r) => r.publicId}
      onRowClick={setViewing}
      rowClassName={() => "group/row"}
      filters={<ListSearchFilters spec={SPEC} placeholder="Search order, customer, reference…" shortPlaceholder="Search…" />}
      emptyIcon={ReceiptTextIcon}
      emptyMessage="No payments yet."
      emptySearchMessage="No payments match your search."
      renderRow={(r) => (
        <>
          <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
            {formatEpoch(r.createdAt, { mode: "datetime", timeZone: tz })}
          </TableCell>
          <TableCell className="text-muted-foreground">{r.email ?? "-"}</TableCell>
          <TableCell className="font-medium">
            <Link href={`/dashboard/orders/${r.orderPublicId}`} className="hover:underline">
              {r.orderPublicId}
            </Link>
          </TableCell>
          <TableCell className="capitalize">{r.method}</TableCell>
          <TableCell>
            <PaymentStatusPill status={r.status} />
          </TableCell>
          <TableCell className="text-right tabular-nums">{formatMoney(Number(r.amount))}</TableCell>
          <TableCell className="text-right">
            <RowActions>
              <RowActionTooltipButton icon={EyeIcon} label="View payment" onClick={() => setViewing(r)} />
            </RowActions>
          </TableCell>
        </>
      )}
    />
      <ListPagination page={page} size={size} total={total} />
      <PaymentDetailDialog payment={viewing} onOpenChange={(o) => !o && setViewing(null)} />
    </div>
  );
}

export function PaymentsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
