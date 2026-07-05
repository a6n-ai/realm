"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRightIcon, ClipboardListIcon } from "lucide-react";
import { DataTable, FilterPill, StageBadge, type Column } from "@/components/ds";
import { TableCell } from "@realm/ui/table";
import { Badge } from "@realm/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@realm/ui/select";
import type { SortState } from "@/lib/list/sort";
import { formatEpoch } from "@/lib/format/datetime";
import { useUrlState } from "@/lib/list/use-url-state";
import type { PipelineRow } from "@/lib/services/inquiries.service";

const STAGE_PILLS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "follow_up", label: "Follow-up" },
  { key: "converted", label: "Converted" },
  { key: "lost", label: "Lost" },
  { key: "overdue", label: "Overdue" },
] as const;

type InquirySortColumn = "name" | "owner" | "stage" | "source" | "lastTouch" | "created";

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift.
const COLUMNS: readonly Column<InquirySortColumn | "nextAction" | "chevron">[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "owner", label: "Owner", sortable: true },
  { key: "stage", label: "Stage", sortable: true },
  { key: "source", label: "Source", sortable: true },
  { key: "lastTouch", label: "Last touch", sortable: true, align: "right" },
  { key: "nextAction", label: "Next action", align: "right" },
  { key: "created", label: "Created", sortable: true, align: "right" },
  { key: "chevron", label: "", width: "w-8" },
];

const ALL_OWNERS = "__all__";

export function InquiriesList({
  rows,
  stageCounts,
  sort,
  emptyCta,
}: {
  rows: PipelineRow[];
  stageCounts: { stage: string; n: number }[];
  sort: SortState<InquirySortColumn>;
  emptyCta?: ReactNode;
}) {
  const [activeStage, setActiveStage] = useUrlState("stage", "all");
  const [owner, setOwner] = useUrlState("owner", ALL_OWNERS);

  const owners = Array.from(
    new Set(rows.map((r) => r.ownerName).filter((n): n is string => !!n)),
  ).sort();

  const countOf = (stage: string) => {
    if (stage === "all") return rows.length;
    if (stage === "overdue") return rows.filter((r) => r.overdue).length;
    return stageCounts.find((r) => r.stage === stage)?.n ?? 0;
  };

  // Stage + owner are still caller-owned URL filters; DataTable owns the "q"
  // search (keys below). Pre-filter here, then hand the result to DataTable.
  const scoped = rows.filter((r) => {
    const matchStage =
      activeStage === "all" ||
      (activeStage === "overdue" ? r.overdue : r.stage === activeStage);
    const matchOwner = owner === ALL_OWNERS || r.ownerName === owner;
    return matchStage && matchOwner;
  });

  return (
    <DataTable
      columns={COLUMNS}
      rows={scoped}
      rowKey={(r) => r.publicId}
      sort={sort}
      idAccessor={(r) => r.publicId}
      idHref={(r) => `/dashboard/inquiries/${r.publicId}`}
      search={{ placeholder: "Search by name, phone, source or ID…", keys: ["fullName", "phone", "source"] }}
      rowClassName={() => "group cursor-pointer"}
      filters={
        <>
          {STAGE_PILLS.map((p) => (
            <FilterPill
              key={p.key}
              label={p.label}
              active={activeStage === p.key}
              count={countOf(p.key)}
              onClick={() => setActiveStage(p.key)}
            />
          ))}
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="All owners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_OWNERS}>All owners</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
      emptyIcon={ClipboardListIcon}
      emptyMessage="No inquiries yet."
      emptySearchMessage="No inquiries match your search."
      emptyAction={emptyCta}
      renderRow={(r) => (
        <>
          <TableCell className="font-medium">
            <Link
              href={`/dashboard/inquiries/${r.publicId}`}
              className="group-hover:underline"
            >
              {r.fullName}
            </Link>
            <div className="text-muted-foreground text-xs">{r.phone}</div>
          </TableCell>
          <TableCell>{r.ownerName ?? "—"}</TableCell>
          <TableCell>
            <StageBadge stage={r.stage} />
          </TableCell>
          <TableCell>{r.source}</TableCell>
          <TableCell className="text-right tabular-nums">
            {r.lastTouchAt != null
              ? formatEpoch(r.lastTouchAt, { mode: "datetime" })
              : "—"}
          </TableCell>
          <TableCell className="text-right">
            {r.nextFollowUpAt != null ? (
              <span className="inline-flex items-center gap-2">
                <span className="tabular-nums">
                  {formatEpoch(r.nextFollowUpAt, { mode: "date" })}
                </span>
                {r.overdue ? <Badge variant="destructive">Overdue</Badge> : null}
              </span>
            ) : (
              "—"
            )}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {formatEpoch(r.createdAt, { mode: "date" })}
          </TableCell>
          <TableCell>
            <ChevronRightIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-60" />
          </TableCell>
        </>
      )}
    />
  );
}

// Loading twin is now owned by DataTable — same COLUMNS, zero drift.
export function InquiriesListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
