"use client";

import Link from "next/link";
import { ScrollTextIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { DataTable, ListPagination, type Column } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { useTimezone } from "@/components/providers/timezone-provider";
import { SETTINGS_ACTIVITY_FACETS } from "@/lib/order-activity/log-facets";
import { formatEpoch } from "@/lib/format/datetime";
import type { SortState } from "@/lib/list/sort";
import type {
  ActivityListRow,
  ActivitySortColumn,
} from "@/lib/services/order-activities-list.service";

const COLUMNS: readonly Column<ActivitySortColumn | "details">[] = [
  { key: "time", label: "When", sortable: true },
  { key: "customer", label: "Customer", sortable: true },
  { key: "action", label: "Action", sortable: true },
  { key: "actor", label: "By", sortable: true },
  { key: "details", label: "Details" },
];

function ActorBadge({
  kind,
  label,
}: {
  kind: ActivityListRow["actorKind"];
  label: string;
}) {
  if (kind === "system") {
    return <span className="text-muted-foreground">{label}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-foreground">{label}</span>
      <Badge variant={kind === "staff" ? "secondary" : "outline"} className="text-[10px]">
        {kind === "staff" ? "Staff" : "Customer"}
      </Badge>
    </span>
  );
}

export function LogsTable({
  rows,
  total,
  page,
  size,
  sort,
}: {
  rows: ActivityListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<ActivitySortColumn>;
}) {
  const tz = useTimezone();
  const fmt = (ms: number) => formatEpoch(ms, { mode: "datetime", timeZone: tz });

  return (
    <div className="space-y-4">
      <DataTable
        serialOffset={page * size}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        sort={sort as SortState<ActivitySortColumn | "details">}
        search={{
          placeholder: "Search customer, actor, order, note…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={SETTINGS_ACTIVITY_FACETS} />}
        emptyIcon={ScrollTextIcon}
        emptyMessage="No activity logged yet."
        emptySearchMessage="No logs match your filters."
        renderRow={(r) => (
          <>
            <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
              {fmt(r.createdAt)}
            </TableCell>
            <TableCell>
              <div className="font-medium">{r.customerName}</div>
              <Link
                href={`/dashboard/orders/${r.orderPublicId}`}
                className="text-muted-foreground hover:text-foreground font-mono text-[10px] hover:underline"
              >
                {r.orderDeploymentId}
              </Link>
            </TableCell>
            <TableCell className="font-medium">{r.action}</TableCell>
            <TableCell>
              <ActorBadge kind={r.actorKind} label={r.actorLabel} />
            </TableCell>
            <TableCell className="text-muted-foreground max-w-[240px] truncate text-xs">
              {r.note ?? (r.fromStatus && r.toStatus ? `${r.fromStatus} → ${r.toStatus}` : "—")}
            </TableCell>
          </>
        )}
        mobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{r.action}</p>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {fmt(r.createdAt)}
              </span>
            </div>
            <p className="text-sm">{r.customerName}</p>
            <ActorBadge kind={r.actorKind} label={r.actorLabel} />
            {r.note ? <p className="text-muted-foreground text-xs">{r.note}</p> : null}
            <Link
              href={`/dashboard/orders/${r.orderPublicId}`}
              className="text-muted-foreground hover:text-foreground text-xs hover:underline"
            >
              View order
            </Link>
          </div>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function LogsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} serial={false} />;
}
