"use client";

import { HistoryIcon } from "lucide-react";
import { TableCell } from "@foundry/ui/table";
import { DataTable, ListPagination, type Column } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { useTimezone } from "@/components/providers/timezone-provider";
import { CRON_RUN_FACETS } from "@/lib/cron/facets";
import type { CronRunListRow } from "@/lib/cron/run";
import { formatEpoch } from "@/lib/format/datetime";
import { RunStatus } from "../run-parts";

const COLUMNS: readonly Column<"when" | "status" | "trigger" | "took" | "result">[] = [
  { key: "when", label: "When" },
  { key: "status", label: "Status" },
  { key: "trigger", label: "Started by" },
  { key: "took", label: "Took" },
  { key: "result", label: "Result" },
];

const label = (k: string) => k.replace(/([A-Z])/g, " $1").toLowerCase();

function took(r: CronRunListRow): string {
  if (r.finishedAt == null) return "—";
  const s = (r.finishedAt - r.startedAt) / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.round(s / 60)}m`;
}

function startedBy(r: CronRunListRow): string {
  if (r.trigger !== "manual") return "Scheduled";
  return r.actorName ? `Run now · ${r.actorName}` : "Run now";
}

function Result({ r }: { r: CronRunListRow }) {
  if (r.ok === false && r.error) return <span className="text-destructive">{r.error}</span>;
  const entries = Object.entries(r.summary ?? {});
  if (!entries.length) return <span className="text-muted-foreground">—</span>;
  return <span className="text-muted-foreground tabular-nums">{entries.map(([k, v]) => `${label(k)} ${v}`).join(" · ")}</span>;
}

export function RunsTable({ rows, total, page, size }: { rows: CronRunListRow[]; total: number; page: number; size: number }) {
  const tz = useTimezone();
  const fmt = (ms: number) => formatEpoch(ms, { mode: "datetime", timeZone: tz });
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        filters={<ReuiFacetFilters spec={CRON_RUN_FACETS} />}
        emptyIcon={HistoryIcon}
        emptyMessage="No runs recorded yet."
        emptySearchMessage="No runs match your filters."
        renderRow={(r) => (
          <>
            <TableCell className="whitespace-nowrap tabular-nums">{fmt(r.startedAt)}</TableCell>
            <TableCell><RunStatus run={r} /></TableCell>
            <TableCell className="text-muted-foreground">{startedBy(r)}</TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{took(r)}</TableCell>
            <TableCell className="text-sm whitespace-normal"><Result r={r} /></TableCell>
          </>
        )}
        mobileCard={(r) => (
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <RunStatus run={r} />
              <span className="text-muted-foreground text-xs tabular-nums">{fmt(r.startedAt)}</span>
            </div>
            <p className="text-muted-foreground text-xs">{startedBy(r)} · {took(r)}</p>
            <Result r={r} />
          </div>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function RunsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} serial={false} />;
}
