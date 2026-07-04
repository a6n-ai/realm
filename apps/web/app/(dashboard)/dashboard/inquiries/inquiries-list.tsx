"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRightIcon, ClipboardListIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FilterBar, FilterPill, SearchInput, StageBadge, EmptyState, SortableHeader,
} from "@/components/ds";
import type { SortState } from "@/lib/list/sort";
import {
  Table, TableHeader, TableHead, TableBody, TableRow, TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatEpoch } from "@/lib/format/datetime";
import { useUrlState, useClearUrlKeys } from "@/lib/list/use-url-state";
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

// Single source of truth for the table's columns. The real header, and the
// skeleton twin below, both render from this — change a column here and both
// update, so the loading skeleton can never drift from the component.
const COLUMNS = [
  { key: "name", label: "Name", sortable: true },
  { key: "owner", label: "Owner", sortable: true },
  { key: "stage", label: "Stage", sortable: true },
  { key: "source", label: "Source", sortable: true },
  { key: "lastTouch", label: "Last touch", sortable: true, align: "right" },
  { key: "nextAction", label: "Next action", align: "right" },
  { key: "created", label: "Created", sortable: true, align: "right" },
  { key: "chevron", label: "", width: "w-8" },
] as const;

const ALL_OWNERS = "__all__";

export function InquiriesList({
  rows,
  stageCounts,
  sort,
  emptyCta,
}: {
  rows: PipelineRow[];
  stageCounts: { stage: string; n: number }[];
  sort: SortState<"name" | "owner" | "stage" | "source" | "lastTouch" | "created">;
  emptyCta?: ReactNode;
}) {
  const [search, setSearch] = useUrlState("q", "");
  const [activeStage, setActiveStage] = useUrlState("stage", "all");
  const [owner, setOwner] = useUrlState("owner", ALL_OWNERS);

  const clearUrlKeys = useClearUrlKeys();
  const hasFilters = !!search || activeStage !== "all" || owner !== ALL_OWNERS;
  const clearFilters = () => clearUrlKeys(["q", "stage", "owner"]);

  const owners = Array.from(
    new Set(rows.map((r) => r.ownerName).filter((n): n is string => !!n)),
  ).sort();

  const countOf = (stage: string) => {
    if (stage === "all") return rows.length;
    if (stage === "overdue") return rows.filter((r) => r.overdue).length;
    return stageCounts.find((r) => r.stage === stage)?.n ?? 0;
  };

  const filtered = rows.filter((r) => {
    const matchStage =
      activeStage === "all" ||
      (activeStage === "overdue" ? r.overdue : r.stage === activeStage);
    const matchOwner = owner === ALL_OWNERS || r.ownerName === owner;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.fullName.toLowerCase().includes(q) ||
      r.phone.includes(q) ||
      r.source.toLowerCase().includes(q);
    return matchStage && matchOwner && matchSearch;
  });

  return (
    <div className="space-y-4">
      <FilterBar
        search={
          <SearchInput value={search} onChange={setSearch} placeholder="Search inquiries…" />
        }
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
      />
      {filtered.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={ClipboardListIcon}
            message="No inquiries match your filter."
            action={
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={ClipboardListIcon}
            message="No inquiries yet."
            action={emptyCta}
          />
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) =>
                "sortable" in c && c.sortable ? (
                  <SortableHeader
                    key={c.key}
                    column={c.key as InquirySortColumn}
                    label={c.label}
                    currentSort={sort.column}
                    currentDir={sort.dir}
                    className={"align" in c ? "text-right" : undefined}
                  />
                ) : (
                  <TableHead key={c.key} className={cn("align" in c && "text-right", "width" in c && c.width)}>
                    {c.label}
                  </TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.publicId} className="group cursor-pointer">
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
                <TableCell className="text-right">
                  <span className="nums">
                    {r.lastTouchAt != null
                      ? formatEpoch(r.lastTouchAt, { mode: "datetime" })
                      : "—"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {r.nextFollowUpAt != null ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="nums">{formatEpoch(r.nextFollowUpAt, { mode: "date" })}</span>
                      {r.overdue ? (
                        <Badge variant="destructive">Overdue</Badge>
                      ) : null}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right"><span className="nums">{formatEpoch(r.createdAt, { mode: "date" })}</span></TableCell>
                <TableCell>
                  <ChevronRightIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-60" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// Exact loading twin: same COLUMNS + same FilterBar/Table markup (search, stage
// pills, owner dropdown), grey cells instead of data. Rendered as the page's
// <Suspense fallback>, so it always matches InquiriesList by construction.
export function InquiriesListSkeleton() {
  return (
    <div className="space-y-4">
      <FilterBar
        search={<Skeleton className="h-9 w-full" />}
        filters={
          <>
            {STAGE_PILLS.map((p) => (
              <Skeleton key={p.key} className="h-8 w-16 rounded-full" />
            ))}
            <Skeleton className="h-8 w-40" />
          </>
        }
      />
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c.key} className={cn("align" in c && "text-right", "width" in c && c.width)}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, r) => (
            <TableRow key={r}>
              {COLUMNS.map((c) => (
                <TableCell key={c.key} className={"align" in c ? "text-right" : undefined}>
                  <Skeleton
                    className={cn(
                      "h-4",
                      c.key === "chevron" ? "w-4" : "w-full max-w-32",
                      "align" in c && "ml-auto",
                    )}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
