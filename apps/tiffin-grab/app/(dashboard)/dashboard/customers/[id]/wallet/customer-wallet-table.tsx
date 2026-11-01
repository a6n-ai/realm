"use client";

import Link from "next/link";
import { CoinsIcon } from "lucide-react";
import { DataTable, ListPagination, type Column, type FacetDef, type SortState } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { MemoCell } from "@/components/dashboard/memo-cell";
import { TableCell } from "@foundry/ui/table";

export type CustomerWalletColumn = "time" | "event" | "source" | "coins" | "order" | "memo";

export type CustomerWalletRow = {
  publicId: string;
  when: string;
  direction: "credit" | "debit";
  eventLabel: string | null;
  sourceLabel: string;
  coins: number;
  memo: string | null;
  orderLabel: string | null;
  orderHref: string | null;
  groupName: string | null;
  groupHref: string | null;
  givenBy: string | null;
};

const COLUMNS: readonly Column<CustomerWalletColumn | "group" | "givenBy">[] = [
  { key: "time", label: "When", sortable: true },
  { key: "event", label: "Event", sortable: true },
  { key: "source", label: "Source", sortable: true },
  { key: "coins", label: "Coins", sortable: true, align: "right" },
  { key: "order", label: "Order", sortable: true },
  { key: "group", label: "Group" },
  { key: "givenBy", label: "Given by" },
  { key: "memo", label: "Memo", sortable: true },
];

export function CustomerWalletTable({ rows, spec, sort, total, page, size }: {
  rows: CustomerWalletRow[];
  spec: FacetDef[];
  sort: SortState<CustomerWalletColumn>;
  total: number;
  page: number;
  size: number;
}) {
  return (
    <>
      <DataTable
        serialOffset={page * size}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        filters={<ListSearchFilters spec={spec} dateControl="external" placeholder="Search memo or source…" shortPlaceholder="Search…" />}
        emptyIcon={CoinsIcon}
        emptyMessage="No wallet activity yet. Use Adjust coins above, or Wallet → Give coins, to add some."
        emptySearchMessage="No wallet entries match your search or filters."
        renderRow={(r) => {
          const credit = r.direction === "credit";
          return (
            <>
              <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{r.when}</TableCell>
              <TableCell>{r.eventLabel ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{r.sourceLabel}</TableCell>
              <TableCell className={`text-right tabular-nums ${credit ? "text-ok" : "text-bad"}`}>
                {credit ? "+" : "−"}
                {r.coins}
              </TableCell>
              <TableCell>
                {r.orderHref && r.orderLabel ? <Link href={r.orderHref} className="text-muted-foreground hover:underline">{r.orderLabel}</Link> : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                {r.groupHref && r.groupName ? <Link href={r.groupHref} className="hover:underline">{r.groupName}</Link> : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="text-muted-foreground">{r.givenBy ?? "—"}</TableCell>
              <MemoCell memo={r.memo} />
            </>
          );
        }}
      />
      <ListPagination page={page} size={size} total={total} />
    </>
  );
}

export function CustomerWalletTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
