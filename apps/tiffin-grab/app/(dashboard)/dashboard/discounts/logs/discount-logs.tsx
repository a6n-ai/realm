"use client";

import Link from "next/link";
import { HistoryIcon } from "lucide-react";
import { DataTable, SkeletonStatCards, StatGrid, type Column } from "@/components/ds";
import { TableCell } from "@realm/ui/table";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { SortState } from "@/lib/list/sort";
import type { DiscountLogSortColumn } from "./page";

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift.
const COLUMNS: readonly Column<DiscountLogSortColumn>[] = [
  { key: "time", label: "Time", sortable: true },
  { key: "coupon", label: "Coupon", sortable: true },
  { key: "user", label: "User", sortable: true },
  { key: "amount", label: "Amount", sortable: true, align: "right" },
  { key: "order", label: "Order", sortable: true },
  { key: "redeemedBy", label: "Redeemed by", sortable: true },
];

type Stat = { label: string; value: string };

type DiscountLogRow = {
  publicId: string;
  createdAt: number;
  amountApplied: string;
  code: string | null;
  email: string | null;
  redeemedByEmail: string | null;
  orderPublicId: string | null;
};

export function DiscountLogs({
  stats,
  rows,
  sort,
}: {
  stats: Stat[];
  rows: DiscountLogRow[];
  sort: SortState<DiscountLogSortColumn>;
}) {
  const tz = useTimezone();
  const fmt = (ms: number) => formatEpoch(ms, { mode: "datetime", timeZone: tz });
  return (
    <>
      <StatGrid cols={4} items={stats} />

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        search={{
          placeholder: "Search by coupon, user or order…",
          shortPlaceholder: "Search…",
          keys: ["code", "email", "redeemedByEmail", "orderPublicId"],
        }}
        emptyIcon={HistoryIcon}
        emptyMessage="No discounts redeemed yet. Coupon redemptions will appear here."
        emptySearchMessage="No redemptions match your search."
        renderRow={(r) => (
          <>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{fmt(r.createdAt)}</TableCell>
            <TableCell className="font-mono text-xs">{r.code ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums text-ok">−${Number(r.amountApplied).toFixed(2)}</TableCell>
            <TableCell>
              {r.orderPublicId ? (
                <Link href={`/dashboard/orders/${r.orderPublicId}`} className="text-muted-foreground hover:underline">
                  {r.orderPublicId}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">{r.redeemedByEmail ?? "—"}</TableCell>
          </>
        )}
      />
    </>
  );
}

// Loading twin: the stat-card grid mirrors the live one; the table is owned by
// DataTable.Skeleton off the same COLUMNS, so header/columns can't drift.
export function DiscountLogsSkeleton() {
  return (
    <>
      <SkeletonStatCards count={4} />
      <DataTable.Skeleton columns={COLUMNS} />
    </>
  );
};
