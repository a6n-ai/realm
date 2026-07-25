"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ScrollTextIcon } from "lucide-react";
import { Badge } from "@realm/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@realm/ui/select";
import { TableCell } from "@realm/ui/table";
import { DataTable, DEFAULT_SIZE, PAGE_SIZES, type Column } from "@/components/ds";
import { useTimezone } from "@/components/providers/timezone-provider";
import { formatEpoch } from "@/lib/format/datetime";
import {
  describeActivity,
  describeActivityActor,
} from "@/lib/services/order-activity-describe";

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

type ActivityFilter = "all" | "deliveries" | "lifecycle" | "meals" | "notes";

const FILTER_OPTIONS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All activity" },
  { value: "deliveries", label: "Deliveries" },
  { value: "lifecycle", label: "Lifecycle" },
  { value: "meals", label: "Meals" },
  { value: "notes", label: "Notes" },
];

const FILTER_TYPES: Record<Exclude<ActivityFilter, "all">, string[]> = {
  deliveries: ["skipped", "unskipped", "delivery_address_changed", "pool_scheduled"],
  lifecycle: ["created", "activated", "paused", "resumed", "cancelled", "status_change"],
  meals: ["meal_pick"],
  notes: ["note"],
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
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const { page, size } = activityPagination(params);

  const pushParams = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const rows = useMemo(() => {
    const view = toViewRows(activities);
    if (filter === "all") return view;
    const allowed = new Set(FILTER_TYPES[filter]);
    return view.filter((row) => allowed.has(row.type));
  }, [activities, filter]);

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
      filters={
        <Select
          value={filter}
          onValueChange={(v) => {
            setFilter(v as ActivityFilter);
            pushParams({ page: "0" });
          }}
        >
          <SelectTrigger className="h-9 w-[11rem]" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
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
