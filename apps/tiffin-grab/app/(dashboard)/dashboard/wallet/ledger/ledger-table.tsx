"use client";

import Link from "next/link";
import { ScrollTextIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/ds";
import { TableCell } from "@realm/ui/table";
import { eventLabel } from "@/components/notifications/template-status";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { SortState } from "@/lib/list/sort";
import type { WalletSortColumn } from "./page";

type Row = {
  publicId: string;
  createdAt: number;
  direction: string;
  eventType: string | null;
  sourceType: string;
  coins: number;
  memo: string | null;
  email: string | null;
  orderPublicId: string | null;
};

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift.
const COLUMNS: readonly Column<WalletSortColumn>[] = [
  { key: "time", label: "Time", sortable: true },
  { key: "user", label: "User", sortable: true },
  { key: "event", label: "Event", sortable: true },
  { key: "source", label: "Source", sortable: true },
  { key: "coins", label: "Coins", sortable: true, align: "right" },
  { key: "order", label: "Order", sortable: true },
  { key: "memo", label: "Memo", sortable: true },
];

export function LedgerTable({
  rows,
  sort,
}: {
  rows: Row[];
  sort: SortState<WalletSortColumn>;
}) {
  const tz = useTimezone();
  const fmt = (ms: number) => formatEpoch(ms, { mode: "datetime", timeZone: tz });
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.publicId}
      sort={sort}
      search={{ placeholder: "Search ledger…", shortPlaceholder: "Search…", debounceMs: 300 }}
      emptyIcon={ScrollTextIcon}
      emptyMessage="No wallet activity yet. Earns and redemptions will appear here."
      renderRow={(r) => {
        const credit = r.direction === "credit";
        return (
          <>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{fmt(r.createdAt)}</TableCell>
            <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
            <TableCell>{r.eventType ? eventLabel(r.eventType) : "—"}</TableCell>
            <TableCell className="text-muted-foreground">{r.sourceType}</TableCell>
            <TableCell className={`text-right tabular-nums ${credit ? "text-ok" : "text-bad"}`}>
              {credit ? "+" : "−"}
              {r.coins}
            </TableCell>
            <TableCell>
              {r.orderPublicId ? (
                <Link href={`/dashboard/orders/${r.orderPublicId}`} className="text-muted-foreground hover:underline">
                  {r.orderPublicId}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">{r.memo ?? ""}</TableCell>
          </>
        );
      }}
    />
  );
}

// Loading twin is owned by DataTable — same COLUMNS, zero drift.
export function LedgerTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
