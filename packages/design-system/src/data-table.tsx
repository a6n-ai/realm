"use client";

import { useCallback, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
import {
  Table, TableHeader, TableHead, TableBody, TableRow, TableCell,
} from "@realm/ui/table";
import { cn } from "@realm/ui/cn";
import { FilterBar } from "./filter-bar";
import { SearchInput } from "./search-input";
import { SortableHeader } from "./sortable-header";

export type SortDir = "asc" | "desc";
export type SortState<K extends string = string> = { column: K; dir: SortDir };

export type Column<K extends string> = {
  key: K;
  label: string;
  sortable?: boolean;
  align?: "right" | "center";
  width?: string;
};

export type DataTableProps<Row, K extends string> = {
  columns: readonly Column<K>[];
  rows: Row[];
  rowKey: (r: Row) => string;
  /** Returns the <TableCell>… children only — DataTable owns the wrapping <TableRow>. */
  renderRow: (r: Row) => ReactNode;
  rowClassName?: (r: Row) => string;
  sort?: SortState<K>;
  /** Leading serial-number ("#") column. On by default; pass false to hide. */
  serial?: boolean;
  /** Leading human ID column (e.g. row.publicId) — always searchable so sales can look rows up by ID. */
  idAccessor?: (r: Row) => string;
  /** Makes the ID cell a link to the row's detail page. */
  idHref?: (r: Row) => string;
  /** ID column header label. Defaults to "ID". */
  idLabel?: string;
  search?: {
    placeholder?: string;
    /** Client-side filter keys. Omit for server-search tables (pass debounceMs). */
    keys?: (keyof Row)[];
    debounceMs?: number;
  };
  filters?: ReactNode;
  actions?: ReactNode;
  emptyIcon: LucideIcon;
  emptyMessage: string;
  emptySearchMessage?: string;
  emptyAction?: ReactNode;
};

const alignClass = (align?: "right" | "center") =>
  align === "right" ? "text-right" : align === "center" ? "text-center" : undefined;

// Inlined "q" URL state — mirrors apps/tiffin-grab/lib/list/use-url-state.ts so
// DataTable stays inside the package (the app hook can't be imported upward).
function useSearchQuery(): [string, (v: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = params.get("q") ?? "";
  const set = useCallback(
    (v: string) => {
      const sp = new URLSearchParams(params.toString());
      if (v === "") sp.delete("q");
      else sp.set("q", v);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  return [value, set];
}

// Sticky header seated with a subtle muted wash so rows scroll under it cleanly.
const HEAD_STICKY = "sticky top-0 z-10 bg-muted/40";

// The two fixed leading columns: serial "#" and the human ID. Rendered by the
// live header and the skeleton twin so both stay in lockstep.
const SERIAL_WIDTH = "w-12";
const ID_WIDTH = "w-36";

function LeadHeads({ serial, hasId, idLabel }: { serial: boolean; hasId: boolean; idLabel: string }) {
  return (
    <>
      {serial && <TableHead className={cn(SERIAL_WIDTH, "text-right")}>#</TableHead>}
      {hasId && <TableHead className={ID_WIDTH}>{idLabel}</TableHead>}
    </>
  );
}

function HeaderRow<K extends string>({
  columns, sort, serial, hasId, idLabel,
}: {
  columns: readonly Column<K>[];
  sort?: SortState<K>;
  serial: boolean;
  hasId: boolean;
  idLabel: string;
}) {
  return (
    <TableRow>
      <LeadHeads serial={serial} hasId={hasId} idLabel={idLabel} />
      {columns.map((c) =>
        c.sortable && sort ? (
          <SortableHeader
            key={c.key}
            column={c.key}
            label={c.label}
            currentSort={sort.column}
            currentDir={sort.dir}
            align={c.align}
            className={c.width}
          />
        ) : (
          <TableHead key={c.key} className={cn(alignClass(c.align), c.width)}>
            {c.label}
          </TableHead>
        ),
      )}
    </TableRow>
  );
}

/**
 * The one bordered data table for the dashboard. Header always renders from
 * `columns`; on zero rows the header stays and a single spanning row carries the
 * empty state — the card never collapses or swaps to a centered panel.
 */
export function DataTable<Row, K extends string>({
  columns, rows, rowKey, renderRow, rowClassName,
  sort, serial = true, idAccessor, idHref, idLabel = "ID",
  search, filters, actions,
  emptyIcon, emptyMessage, emptySearchMessage, emptyAction,
}: DataTableProps<Row, K>) {
  const [searchValue, setSearchValue] = useSearchQuery();
  const hasId = !!idAccessor;
  const leadCount = (serial ? 1 : 0) + (hasId ? 1 : 0);

  // The ID column is always searchable client-side, even when the page didn't
  // list it in search.keys — sales look rows up by their public ID.
  const filtered = search?.keys
    ? rows.filter((r) => {
        const q = searchValue.toLowerCase();
        if (!q) return true;
        if (idAccessor && idAccessor(r).toLowerCase().includes(q)) return true;
        return search.keys!.some((k) => String(r[k] ?? "").toLowerCase().includes(q));
      })
    : rows;

  return (
    <div className="space-y-4">
      <FilterBar
        search={
          <SearchInput
            value={searchValue}
            onChange={setSearchValue}
            placeholder={search?.placeholder}
            debounceMs={search?.debounceMs}
          />
        }
        filters={filters}
        actions={actions}
      />
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className={HEAD_STICKY}>
            <HeaderRow columns={columns} sort={sort} serial={serial} hasId={hasId} idLabel={idLabel} />
          </TableHeader>
          <TableBody>
            {filtered.length ? (
              filtered.map((r, i) => (
                <TableRow key={rowKey(r)} className={rowClassName?.(r)}>
                  {serial && (
                    <TableCell className="text-muted-foreground text-right tabular-nums">{i + 1}</TableCell>
                  )}
                  {hasId && (
                    <TableCell className="font-mono text-xs">
                      {idHref ? (
                        <Link href={idHref(r)} className="text-muted-foreground hover:text-foreground hover:underline">
                          {idAccessor!(r)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{idAccessor!(r)}</span>
                      )}
                    </TableCell>
                  )}
                  {renderRow(r)}
                </TableRow>
              ))
            ) : (
              <TableEmptyRow
                colSpan={columns.length + leadCount}
                icon={emptyIcon}
                message={
                  searchValue
                    ? emptySearchMessage ??
                      `No results match “${searchValue}”.`
                    : emptyMessage
                }
                action={
                  searchValue ? (
                    <Button variant="outline" size="sm" onClick={() => setSearchValue("")}>
                      Clear filters
                    </Button>
                  ) : (
                    emptyAction
                  )
                }
              />
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * In-table empty state: one row spanning every column, min-height so the card
 * keeps its shape. Use inside a <TableBody> when a table has no matching rows.
 */
export function TableEmptyRow({
  colSpan, icon: Icon, message, action,
}: {
  colSpan: number;
  icon: LucideIcon;
  message: string;
  action?: ReactNode;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="h-40 text-center">
        <div className="grid place-items-center gap-3 py-8">
          <span className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-xl">
            <Icon className="size-6" />
          </span>
          <p className="text-muted-foreground max-w-sm">{message}</p>
          {action}
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Loading twin — same bordered card + FilterBar + header-from-columns + N grey
 * rows. One source of truth so the skeleton can't drift from DataTable.
 */
function DataTableSkeleton<K extends string>({
  columns, rows = 8, serial = true, hasId = false, idLabel = "ID",
}: {
  columns: readonly Column<K>[];
  rows?: number;
  serial?: boolean;
  hasId?: boolean;
  idLabel?: string;
}) {
  return (
    <div className="space-y-4">
      <FilterBar search={<Skeleton className="h-9 w-full" />} />
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className={HEAD_STICKY}>
            <TableRow>
              <LeadHeads serial={serial} hasId={hasId} idLabel={idLabel} />
              {columns.map((c) => (
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
                  <TableCell className={cn(SERIAL_WIDTH, "text-right")}>
                    <Skeleton className="ml-auto h-4 w-4" />
                  </TableCell>
                )}
                {hasId && (
                  <TableCell className={ID_WIDTH}>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                )}
                {columns.map((c) => (
                  <TableCell key={c.key} className={alignClass(c.align)}>
                    <Skeleton
                      className={cn(
                        "h-4",
                        c.width ? "w-4" : "w-full max-w-32",
                        c.align === "right" && "ml-auto",
                        c.align === "center" && "mx-auto",
                      )}
                    />
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

DataTable.Skeleton = DataTableSkeleton;
