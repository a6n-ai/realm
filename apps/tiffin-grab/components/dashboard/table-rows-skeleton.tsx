import type { ReactNode } from "react";
import { SearchIcon } from "lucide-react";
import type { Column, FacetDef } from "@foundry/design-system";
import { cn } from "@foundry/ui/cn";
import { Input } from "@foundry/ui/input";
import { Skeleton } from "@foundry/ui/skeleton";
import { FilterBarSkeleton } from "./filter-bar-skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";

const ACTION_KEYS = new Set(["actions", "action", "edit", "invite", "select"]);
const TITLE_BARS = ["w-3/5", "w-2/5", "w-1/2", "w-2/3"];
const SUB_BARS = ["w-2/3", "w-1/2", "w-3/5", "w-3/4"];
const TEXT_BARS = ["w-full max-w-24", "w-full max-w-32", "w-full max-w-20"];

// Placeholders follow the column kind; the first text column is the row's title and subtitle.
function Cell({ column, firstText, lines, row, col }: { column: Column<string>; firstText: boolean; lines: 1 | 2; row: number; col: number }) {
  if (ACTION_KEYS.has(column.key) || column.label === "") return <Skeleton className="ml-auto size-6" />;
  if (column.align === "right") return <Skeleton className="ml-auto h-4 w-12" />;
  if (column.align === "center") return <Skeleton shape="pill" className="mx-auto h-5 w-16" />;
  if (firstText && lines === 1) return <Skeleton className={cn("h-4", TITLE_BARS[row % TITLE_BARS.length])} />;
  if (firstText) {
    return (
      <div className="flex flex-col gap-1.5">
        <Skeleton className={cn("h-4", TITLE_BARS[row % TITLE_BARS.length])} />
        <Skeleton className={cn("h-3", SUB_BARS[row % SUB_BARS.length])} />
      </div>
    );
  }
  return <Skeleton className={cn("h-4", TEXT_BARS[(row + col) % TEXT_BARS.length])} />;
}

/** The chips ListSearchFilters pins (first three facets; the date one only when its menu owns it). */
export function pinnedFacetLabels(spec: readonly FacetDef[], dateControl: "menu" | "inline" | "external" = "menu", pinned = 3): string[] {
  const hideDate = dateControl !== "menu" && spec.some((f) => f.kind === "dateRange");
  return spec.flatMap((f) => (f.kind === "search" || (hideDate && f.kind === "dateRange") ? [] : [f.label])).slice(0, pinned);
}

const alignClass = (align?: "right" | "center") => (align === "right" ? "text-right" : align === "center" ? "text-center" : undefined);

export function TableRowsSkeleton<K extends string>({
  columns,
  rows = 10,
  serial = true,
  hasId = false,
  idLabel = "ID",
  search,
  filters,
  toolbar,
  firstColumnLines = 1,
}: {
  columns: readonly Column<K>[];
  rows?: number;
  serial?: boolean;
  hasId?: boolean;
  idLabel?: string;
  search?: string;
  /** Pinned facet labels of the real filter bar; `[]` renders only Add Filter. Omit when the table has no filter bar. */
  filters?: readonly string[];
  /** Extra controls the real bar shows after the search (status pills, a select). */
  toolbar?: ReactNode;
  /** 2 when the real first cell renders a subtitle under its title. */
  firstColumnLines?: 1 | 2;
}) {
  const cols: readonly Column<string>[] = columns;
  const firstText = cols.findIndex((c) => !c.align && !ACTION_KEYS.has(c.key) && c.label !== "");
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      {search || filters || toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {search ? (
            <div className="relative w-full max-w-sm">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input disabled aria-label={search} placeholder={search} className="pl-8" />
            </div>
          ) : null}
          {filters ? <FilterBarSkeleton labels={filters} /> : null}
          {toolbar}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-(--ui-table-frame-radius) border [&_[data-slot=table-container]]:ring-transparent">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              {serial && <TableHead className="w-12 text-right">#</TableHead>}
              {hasId && <TableHead className="w-36">{idLabel}</TableHead>}
              {cols.map((c) => (
                <TableHead key={c.key} className={cn(alignClass(c.align), c.width)}>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, r) => (
              <TableRow key={r}>
                {serial && (
                  <TableCell>
                    <Skeleton className="ml-auto h-4 w-4" />
                  </TableCell>
                )}
                {hasId && (
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                )}
                {cols.map((c, i) => (
                  <TableCell key={c.key} className={alignClass(c.align)}>
                    <Cell column={c} firstText={i === firstText} lines={firstColumnLines} row={r} col={i} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
