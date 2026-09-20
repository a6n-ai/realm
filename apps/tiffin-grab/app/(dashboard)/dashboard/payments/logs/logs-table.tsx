"use client";

import Link from "next/link";
import { ActivityIcon } from "lucide-react";
import { TableCell } from "@foundry/ui/table";
import { DataTable, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import type { SortState } from "@/lib/list/sort";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import { PaymentStatusPill } from "../payment-status-pill";
import { LOG_EVENT_OPTIONS, type LogSortKey } from "../payment-facets";

type Row = {
  publicId: string;
  createdAt: number;
  type: string;
  note: string | null;
  actorEmail: string | null;
  orderPublicId: string;
};

const EVENT_STATUS: Record<string, string> = {
  payment_claimed: "pending_verification",
  payment_verified: "paid",
  payment_rejected: "rejected",
};
const EVENT_LABEL: Record<string, string> = {
  payment_claimed: "Customer claimed payment",
  payment_verified: "Staff approved",
  payment_rejected: "Staff rejected",
};

const SPEC: FacetDef[] = [
  { kind: "multi", field: "event", label: "Event", options: [...LOG_EVENT_OPTIONS] },
  { kind: "search", fields: [] },
];

const COLUMNS: readonly Column<LogSortKey | "detail">[] = [
  { key: "time", label: "Time", sortable: true },
  { key: "event", label: "Event", sortable: true },
  { key: "order", label: "Order", sortable: true },
  { key: "by", label: "By", sortable: true },
  { key: "detail", label: "Detail" },
];

export function LogsTable({ rows, sort }: { rows: Row[]; sort: SortState<LogSortKey> }) {
  const tz = useTimezone();
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.publicId}
      sort={sort as SortState<LogSortKey | "detail">}
      filters={<ListSearchFilters spec={SPEC} placeholder="Search order, person, note…" shortPlaceholder="Search…" />}
      emptyIcon={ActivityIcon}
      emptyMessage="No payment events yet."
      renderRow={(r) => (
        <>
          <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
            {formatEpoch(r.createdAt, { mode: "datetime", timeZone: tz })}
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              <PaymentStatusPill status={EVENT_STATUS[r.type] ?? r.type} />
              <span className="text-sm">{EVENT_LABEL[r.type] ?? r.type}</span>
            </div>
          </TableCell>
          <TableCell>
            <Link href={`/dashboard/orders/${r.orderPublicId}`} className="hover:underline">
              {r.orderPublicId}
            </Link>
          </TableCell>
          <TableCell className="text-muted-foreground">{r.actorEmail ?? "-"}</TableCell>
          <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">{r.note ?? ""}</TableCell>
        </>
      )}
    />
  );
}

export function LogsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
