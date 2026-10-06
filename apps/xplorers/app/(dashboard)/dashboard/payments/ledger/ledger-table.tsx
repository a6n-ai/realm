"use client";

import Link from "next/link";
import { ScrollTextIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { DataTable, ListPagination, ListSearchFilters, type Column, type FacetDef } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import type { SortState } from "@/lib/list/sort";
import type { LedgerPageRow, LedgerSortColumn } from "@/lib/services/ledger.service";

export type LedgerTableRow = LedgerPageRow & { whenLabel: string };

const COLUMNS: readonly Column<LedgerSortColumn | "type" | "family" | "memo">[] = [
  { key: "time", label: "Time", sortable: true },
  { key: "type", label: "Type" },
  { key: "family", label: "Family" },
  { key: "memo", label: "Memo" },
  { key: "amount", label: "Amount", sortable: true, align: "right" },
];

export function LedgerTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: LedgerTableRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<LedgerSortColumn>;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        serialOffset={page * size}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        idAccessor={(r) => r.publicId}
        idLabel="Entry"
        filters={<ListSearchFilters spec={spec} placeholder="Search family…" shortPlaceholder="Search…" />}
        emptyIcon={ScrollTextIcon}
        emptyMessage="No ledger entries yet. Verified payments post here."
        emptySearchMessage="No entries match your search."
        renderRow={(r) => (
          <>
            <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">{r.whenLabel}</TableCell>
            <TableCell>
              <Badge variant="outline" className="capitalize">
                {r.type}
              </Badge>
            </TableCell>
            <TableCell>
              <Link href={`/dashboard/customers/${r.customerPublicId}`} className="font-medium hover:underline">
                {r.customerName ?? r.customerEmail ?? "Unknown"}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{r.memo ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">
              {r.direction === "debit" ? "−" : "+"}
              {formatMoney(Number(r.amount), r.currency)}
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function LedgerTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
