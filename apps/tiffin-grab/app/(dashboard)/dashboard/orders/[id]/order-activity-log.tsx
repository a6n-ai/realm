"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ScrollTextIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { DataTable, DEFAULT_SIZE, PAGE_SIZES, type Column } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { useTimezone } from "@/components/providers/timezone-provider";
import { formatEpoch } from "@/lib/format/datetime";
import {
  describeActivity,
  describeActivityActor,
} from "@/lib/services/order-activity-describe";
import { filterActivityRows, ORDER_ACTIVITY_FACETS } from "./activity-facets";

export type OrderActivityLogRow = {
  publicId: string;
  type: string;
  note: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: number;
  createdBy: bigint | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
};

type ViewRow = OrderActivityLogRow & {
  action: string;
  actorLabel: string;
  actorKind: "system" | "staff" | "customer";
};

const COLUMNS: readonly Column<"time" | "action" | "actor" | "details">[] = [
  { key: "time", label: "Time" },
  { key: "action", label: "Action" },
  { key: "actor", label: "By" },
  { key: "details", label: "Details" },
];

function toViewRows(rows: OrderActivityLogRow[]): ViewRow[] {
  return rows.map((row) => {
    const actor = describeActivityActor(row);
    return {
      ...row,
      action: describeActivity(row),
      actorLabel: actor.label,
      actorKind: actor.kind,
    };
  });
}

function ActorBadge({ kind, label }: { kind: ViewRow["actorKind"]; label: string }) {
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

function activityPagination(sp: URLSearchParams) {
  const page = Math.max(0, Number.parseInt(sp.get("page") ?? "0", 10) || 0);
  const rawSize = Number.parseInt(sp.get("size") ?? String(DEFAULT_SIZE), 10);
  const size = (PAGE_SIZES as readonly number[]).includes(rawSize) ? rawSize : DEFAULT_SIZE;
  return { page, size };
}

export function OrderActivityLog({ activities }: { activities: OrderActivityLogRow[] }) {
  const tz = useTimezone();
  const params = useSearchParams();
  const { page, size } = activityPagination(params);

  const rows = useMemo(() => {
    const view = toViewRows(activities);
    return filterActivityRows(view, params);
  }, [activities, params]);

  const fmt = (ms: number) => formatEpoch(ms, { mode: "datetime", timeZone: tz });

  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.publicId}
      serial={false}
      search={{
        placeholder: "Search activity, actor, or note…",
        shortPlaceholder: "Search…",
        keys: ["action", "actorLabel", "actorEmail", "note", "type"],
      }}
      filters={<ReuiFacetFilters spec={ORDER_ACTIVITY_FACETS} />}
      pagination={{ page, size }}
      emptyIcon={ScrollTextIcon}
      emptyMessage="No activity yet."
      emptySearchMessage="No activity matches your search."
      renderRow={(r) => (
        <>
          <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
            {fmt(r.createdAt)}
          </TableCell>
          <TableCell className="font-medium">{r.action}</TableCell>
          <TableCell>
            <ActorBadge kind={r.actorKind} label={r.actorLabel} />
          </TableCell>
          <TableCell className="max-w-[240px] truncate text-muted-foreground text-xs">
            {r.note ?? (r.fromStatus && r.toStatus ? `${r.fromStatus} → ${r.toStatus}` : "—")}
          </TableCell>
        </>
      )}
      mobileCard={(r) => (
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">{r.action}</p>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{fmt(r.createdAt)}</span>
          </div>
          <ActorBadge kind={r.actorKind} label={r.actorLabel} />
          {r.note ? <p className="text-muted-foreground text-xs">{r.note}</p> : null}
        </div>
      )}
    />
  );
}

export function OrderActivityLogSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} serial={false} />;
}
