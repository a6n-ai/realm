"use client";

import Link from "next/link";
import { HistoryIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/ds";
import { TableCell } from "@realm/ui/table";
import { Skeleton } from "@realm/ui/skeleton";
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

function fmt(ms: number): string {
  return new Date(ms).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

function StatsGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border p-4">
          <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export function DiscountLogs({
  stats,
  rows,
  sort,
}: {
  stats: Stat[];
  rows: DiscountLogRow[];
  sort: SortState<DiscountLogSortColumn>;
}) {
  return (
    <>
      <StatsGrid stats={stats} />

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        search={{
          placeholder: "Search by coupon, user or order…",
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
DiscountLogs.Skeleton = function DiscountLogsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>

      <DataTable.Skeleton columns={COLUMNS} />
    </>
  );
};
