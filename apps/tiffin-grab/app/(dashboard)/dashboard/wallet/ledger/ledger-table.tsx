"use client";

import { pageOffset } from "@/lib/list/pagination";
import Link from "next/link";
import { ScrollTextIcon } from "lucide-react";
import { DataTable, ListPagination, type Column, type FacetDef, type SortState } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/filters";
import { TableCell } from "@foundry/ui/table";
import { MemoCell } from "@/components/dashboard/memo-cell";

export type LedgerColumn = "time" | "user" | "event" | "source" | "coins" | "order" | "memo";

/** One ledger line, already formatted by the page (functions cannot cross into a client component). */
export type LedgerRow = {
  publicId: string;
  when: string;
  direction: "credit" | "debit";
  eventLabel: string | null;
  sourceType: string;
  coins: number;
  memo: string | null;
  who: string | null;
  whoHref: string | null;
  orderLabel: string | null;
  orderHref: string | null;
};

// Event and Source share one column so Memo fits on screen.
const COLUMNS: readonly Column<LedgerColumn>[] = [
  { key: "time", label: "Time", sortable: true, width: "w-40" },
  { key: "user", label: "Customer", sortable: true, width: "w-48" },
  { key: "source", label: "Type", sortable: true, width: "w-36" },
  { key: "coins", label: "Coins", sortable: true, align: "right", width: "w-20" },
  { key: "order", label: "Order", sortable: true, width: "w-32" },
  { key: "memo", label: "Memo", sortable: true },
];

export function LedgerTable({ rows, spec, sort, total, page, size }: {
  rows: LedgerRow[];
  spec: FacetDef[];
  sort: SortState<LedgerColumn>;
  total: number;
  page: number;
  size: number;
}) {
  return (
    <>
      <DataTable
        serialOffset={pageOffset(page, size)}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        filters={<ListSearchFilters spec={spec} dateControl="external" placeholder="Search ledger…" shortPlaceholder="Search…" />}
        emptyIcon={ScrollTextIcon}
        emptyMessage="No wallet activity yet. Earns and redemptions will appear here."
        emptySearchMessage="No ledger entries match your search or filters."
        renderRow={(r) => {
          const credit = r.direction === "credit";
          return (
            <>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{r.when}</TableCell>
              <TableCell className="truncate text-muted-foreground">
                {r.whoHref && r.who ? <Link href={r.whoHref} className="hover:underline">{r.who}</Link> : (r.who ?? "—")}
              </TableCell>
              <TableCell className="truncate">{r.eventLabel ?? r.sourceType}</TableCell>
              <TableCell className={`text-right tabular-nums ${credit ? "text-ok" : "text-bad"}`}>
                {credit ? "+" : "−"}
                {r.coins}
              </TableCell>
              <TableCell>
                {r.orderHref && r.orderLabel ? (
                  <Link href={r.orderHref} className="text-muted-foreground hover:underline">{r.orderLabel}</Link>
                ) : (
                  <span className="text-muted-foreground">{r.orderLabel ?? "—"}</span>
                )}
              </TableCell>
              <MemoCell memo={r.memo} />
            </>
          );
        }}
      />
      <ListPagination page={page} size={size} total={total} />
    </>
  );
}

export function LedgerTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
