"use client";

import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import Link from "next/link";
import { ScrollTextIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { TableCell } from "@foundry/ui/table";
import { DataTable, ListPagination, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@foundry/design-system/list-sort";
import { LEDGER_TYPE_OPTIONS, type LedgerSortKey } from "../payment-facets";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@foundry/design-system/timezone-provider";

type Row = {
  publicId: string;
  createdAt: number;
  direction: string;
  type: string;
  amount: string;
  memo: string | null;
  email: string | null;
  orderPublicId: string | null;
};

const SPEC: FacetDef[] = [
  { kind: "multi", field: "type", label: "Type", options: [...LEDGER_TYPE_OPTIONS] },
  { kind: "dateRange", field: "createdAt", label: "Date" },
  { kind: "search", fields: [] },
];

const COLUMNS: readonly Column<LedgerSortKey | "memo">[] = [
  { key: "time", label: "Time", sortable: true },
  { key: "customer", label: "Customer", sortable: true },
  { key: "type", label: "Type", sortable: true },
  { key: "order", label: "Order", sortable: true },
  { key: "memo", label: "Memo" },
  { key: "amount", label: "Amount", sortable: true, align: "right" },
];

export function MoneyLedgerTable({
  rows,
  total,
  page,
  size,
  sort,
}: {
  rows: Row[];
  total: number;
  page: number;
  size: number;
  sort: SortState<LedgerSortKey>;
}) {
  const tz = useTimezone();
  return (
    <div className="space-y-4">
    <DataTable
      serialOffset={pageOffset(page, size)}
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.publicId}
      idAccessor={(r) => r.publicId}
      sort={sort as SortState<LedgerSortKey | "memo">}
      filters={<ListSearchFilters spec={SPEC} placeholder="Search ledger…" shortPlaceholder="Search…" dateControl="external" />}
      emptyIcon={ScrollTextIcon}
      emptyMessage="No money movements yet. Approved payments, refunds and discounts appear here."
      emptySearchMessage="No ledger entries match your search."
      renderRow={(r) => {
        const credit = r.direction === "credit";
        return (
          <>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
              {formatEpoch(r.createdAt, { mode: "datetime", timeZone: tz })}
            </TableCell>
            <TableCell className="text-muted-foreground">{r.email ?? "-"}</TableCell>
            <TableCell className="capitalize">{r.type}</TableCell>
            <TableCell>
              {r.orderPublicId ? (
                <Link href={`/dashboard/orders/${r.orderPublicId}`} className="hover:underline">
                  {r.orderPublicId}
                </Link>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">{r.memo ?? ""}</TableCell>
            <TableCell className={`text-right tabular-nums ${credit ? "text-ok" : "text-bad"}`}>
              {credit ? "+" : "-"}
              {formatMoney(Number(r.amount))}
            </TableCell>
          </>
        );
      }}
    />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function MoneyLedgerTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
