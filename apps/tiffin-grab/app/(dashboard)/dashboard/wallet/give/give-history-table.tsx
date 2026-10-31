"use client";

import Link from "next/link";
import { CoinsIcon } from "lucide-react";
import { DataTable, ListPagination, type Column, type FacetDef, type SortState } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { TableCell } from "@foundry/ui/table";

export type GiveColumn = "when" | "customer" | "coins" | "type" | "group" | "givenBy" | "memo";

/** One Give coins credit, already formatted by the page (functions cannot cross into a client component). */
export type GiveRow = {
  publicId: string;
  when: string;
  customer: string;
  coins: number;
  type: string;
  group: string | null;
  groupPublicId: string | null;
  givenBy: string;
  memo: string | null;
};

const COLUMNS: readonly Column<GiveColumn>[] = [
  { key: "when", label: "When", sortable: true },
  { key: "customer", label: "Customer", sortable: true },
  { key: "coins", label: "Coins", sortable: true, align: "right" },
  { key: "type", label: "Type", sortable: true },
  { key: "group", label: "Group", sortable: true },
  { key: "givenBy", label: "Given by", sortable: true },
  { key: "memo", label: "Memo", sortable: true },
];

export function GiveHistoryTable({ rows, spec, sort, total, page, size }: {
  rows: GiveRow[];
  spec: FacetDef[];
  sort: SortState<GiveColumn>;
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
        filters={<ListSearchFilters spec={spec} dateControl="external" placeholder="Search by customer name or email…" shortPlaceholder="Search…" />}
        emptyIcon={CoinsIcon}
        emptyMessage="No coins have been given yet. Use Give coins to reward a group or one customer."
        emptySearchMessage="No grants match your search or filters."
        renderRow={(r) => (
          <>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{r.when}</TableCell>
            <TableCell className="font-medium">{r.customer}</TableCell>
            <TableCell className="text-ok text-right tabular-nums">+{r.coins}</TableCell>
            <TableCell className="text-muted-foreground">{r.type}</TableCell>
            <TableCell>
              {r.group && r.groupPublicId ? (
                <Link href={`/dashboard/customer-groups/${r.groupPublicId}`} className="hover:underline">{r.group}</Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">{r.givenBy}</TableCell>
            <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">{r.memo ?? ""}</TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </>
  );
}

export function GiveHistoryTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
