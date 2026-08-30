"use client";

import Link from "next/link";
import { ScrollTextIcon } from "lucide-react";
import {
  DataTable,
  ListPagination,
  SkeletonFilterBar,
  type Column,
  type FacetDef,
} from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { TableCell } from "@realm/ui/table";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import type { LedgerListRow, LedgerSortColumn } from "@/lib/services/ledger.service";

type Row = LedgerListRow & { amountLabel: string };

type LedgerCol = LedgerSortColumn | "order" | "memo" | "client";

// "Client" only appears for a brand admin's cross-franchise view — see
// orders-table.tsx's identical columnsFor for why.
function columnsFor(showClient: boolean): readonly Column<LedgerCol>[] {
  return [
    { key: "created", label: "Time", sortable: true },
    { key: "type", label: "Type", sortable: true },
    { key: "direction", label: "Direction", sortable: true },
    { key: "customer", label: "Customer", sortable: true },
    ...(showClient ? [{ key: "client", label: "Client", sortable: false } as const] : []),
    { key: "order", label: "Order", sortable: false },
    { key: "memo", label: "Memo", sortable: false },
    { key: "amount", label: "Amount", sortable: true, align: "right" },
  ];
}

export function LedgerTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: Row[];
  total: number;
  page: number;
  size: number;
  sort: SortState<LedgerSortColumn>;
}) {
  const showClient = rows.some((r) => r.clientCode);
  const columns = columnsFor(showClient);
  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        sort={sort}
        search={{
          placeholder: "Search ledger, order, or customer…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={ScrollTextIcon}
        emptyMessage="No ledger entries yet."
        emptySearchMessage="No ledger entries match your filters."
        renderRow={(r) => {
          const credit = r.direction === "credit";
          return (
            <>
              <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
                {new Date(r.createdAt).toLocaleString()}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{r.type}</Badge>
              </TableCell>
              <TableCell className="capitalize">{r.direction}</TableCell>
              <TableCell>
                {r.customerName ? (
                  <>
                    <div className="font-medium">{r.customerName}</div>
                    <div className="text-muted-foreground text-xs">{r.customerEmail}</div>
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              {showClient && (
                <TableCell className="font-mono text-xs">{r.clientCode ?? "—"}</TableCell>
              )}
              <TableCell>
                {r.orderPublicId ? (
                  <Link
                    href={`/dashboard/orders/${r.orderPublicId}`}
                    className="font-mono text-xs hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.orderPublicId}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground max-w-[240px] truncate text-xs">
                {r.memo ?? ""}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums ${credit ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
              >
                {credit ? "+" : "−"}
                {r.amountLabel}
              </TableCell>
            </>
          );
        }}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function LedgerTableSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonFilterBar dropdown />
      <DataTable.Skeleton columns={columnsFor(false)} serial={false} />
    </div>
  );
}
