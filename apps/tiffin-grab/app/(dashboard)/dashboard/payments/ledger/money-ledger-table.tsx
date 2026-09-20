"use client";

import Link from "next/link";
import { ScrollTextIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { TableCell } from "@foundry/ui/table";
import { DataTable, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import type { SortState } from "@/lib/list/sort";
import { LEDGER_TYPE_OPTIONS, type LedgerSortKey } from "../payment-facets";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";

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

export function MoneyLedgerTable({ rows, sort }: { rows: Row[]; sort: SortState<LedgerSortKey> }) {
  const tz = useTimezone();
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.publicId}
      sort={sort as SortState<LedgerSortKey | "memo">}
      filters={<ListSearchFilters spec={SPEC} placeholder="Search ledger…" shortPlaceholder="Search…" />}
      emptyIcon={ScrollTextIcon}
      emptyMessage="No money movements yet. Approved payments, refunds and discounts appear here."
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
  );
}

export function MoneyLedgerTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
