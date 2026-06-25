"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, ClipboardListIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { formatEpoch } from "@/lib/format/datetime";
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
  const [search, setSearch] = useState("");
  const [activeStage, setActiveStage] = useState<string>("all");
  const [owner, setOwner] = useState<string>(ALL_OWNERS);

  const hasFilters = !!search || activeStage !== "all" || owner !== ALL_OWNERS;
  const clearFilters = () => {
    setSearch("");
    setActiveStage("all");
    setOwner(ALL_OWNERS);
  };

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
              <SortableHeader column="name" label="Name" currentSort={sort.column} currentDir={sort.dir} />
              <SortableHeader column="owner" label="Owner" currentSort={sort.column} currentDir={sort.dir} />
              <SortableHeader column="stage" label="Stage" currentSort={sort.column} currentDir={sort.dir} />
              <SortableHeader column="source" label="Source" currentSort={sort.column} currentDir={sort.dir} />
              <SortableHeader column="lastTouch" label="Last touch" currentSort={sort.column} currentDir={sort.dir} className="text-right" />
              <TableHead className="text-right">Next action</TableHead>
              <SortableHeader column="created" label="Created" currentSort={sort.column} currentDir={sort.dir} className="text-right" />
              <TableHead className="w-8" />
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
