"use client";

import {
  Children, Fragment, isValidElement, useCallback,
  type ReactElement, type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, type LucideIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@realm/ui/dropdown-menu";
import {
  Table, TableHeader, TableHead, TableBody, TableRow, TableCell,
} from "@realm/ui/table";
import { cn } from "@realm/ui/cn";
import { FilterBar } from "./filter-bar";
import { SortableHeader } from "./sortable-header";
import { useSortNav } from "./use-sort-nav";

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
  /** Escape hatch: render a custom mobile card body instead of the auto-derived one. */
  mobileCard?: (r: Row) => ReactNode;
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
    /** Shorter placeholder shown at mobile widths (<sm) where the full one truncates. */
    shortPlaceholder?: string;
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

// renderRow returns a fragment of <TableCell>s aligned 1:1 with `columns`.
// Pull the cells out and, for each, its inner content (a <td> can't live
// outside a <table>, so we render children, not the cell element).
function rowCells(node: ReactNode): ReactNode[] {
  const top = isValidElement(node) && node.type === Fragment
    ? (node as ReactElement<{ children?: ReactNode }>).props.children
    : node;
  return Children.toArray(top);
}
function cellContent(cell: ReactNode): ReactNode {
  return isValidElement(cell)
    ? (cell as ReactElement<{ children?: ReactNode }>).props.children
    : cell;
}

function MobileCard<Row, K extends string>({
  row, columns, renderRow, mobileCard, idAccessor, idHref, rowClassName,
}: {
  row: Row;
  columns: readonly Column<K>[];
  renderRow: (r: Row) => ReactNode;
  mobileCard?: (r: Row) => ReactNode;
  idAccessor?: (r: Row) => string;
  idHref?: (r: Row) => string;
  rowClassName?: (r: Row) => string;
}) {
  const cells = mobileCard ? [] : rowCells(renderRow(row));
  // Auto-derivation needs one cell per column. A renderRow that returns a
  // *component* (not an inline <>…</> of TableCells) can't be introspected —
  // pass `mobileCard` for those. Warn loudly instead of rendering a blank card.
  if (!mobileCard && cells.length !== columns.length && process.env.NODE_ENV !== "production") {
    console.warn(
      `DataTable: renderRow yielded ${cells.length} cell(s) for ${columns.length} column(s); ` +
        `pass a mobileCard() when renderRow returns a component.`,
    );
  }
  const lastIdx = columns.length - 1;
  const trailing = !mobileCard && columns[lastIdx]?.label === "" ? cells[lastIdx] : null;
  const fields = mobileCard
    ? []
    : columns
        .map((c, i) => ({ c, cell: cells[i] }))
        .slice(1)
        .filter(({ c }) => c.label !== "");

  return (
    <div className={cn("bg-card relative rounded-lg border p-4", rowClassName?.(row))}>
      {idHref && (
        <Link
          href={idHref(row)}
          className="absolute inset-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={idAccessor ? idAccessor(row) : undefined}
        />
      )}
      {mobileCard ? (
        mobileCard(row)
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              {idAccessor && (
                <div className="text-muted-foreground font-mono text-xs">{idAccessor(row)}</div>
              )}
              <div className="text-base font-medium">{cellContent(cells[0])}</div>
            </div>
            {trailing && <div className="text-muted-foreground shrink-0">{cellContent(trailing)}</div>}
          </div>
          {fields.length > 0 && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {fields.map(({ c, cell }) => (
                <Fragment key={c.key}>
                  <dt className="text-muted-foreground">{c.label}</dt>
                  <dd className="text-right font-medium">{cellContent(cell)}</dd>
                </Fragment>
              ))}
            </dl>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The one bordered data table for the dashboard. Header always renders from
 * `columns`; on zero rows the header stays and a single spanning row carries the
 * empty state — the card never collapses or swaps to a centered panel.
 */
// Mobile card lists have no clickable headers, so sorting moves into this
// dropdown (md:hidden) next to search/Filters. Reuses the same URL sort-nav as
// the desktop SortableHeader, so both stay in lockstep.
function MobileSort<K extends string>({ columns, sort }: { columns: readonly Column<K>[]; sort: SortState<K> }) {
  const sortNav = useSortNav();
  const sortable = columns.filter((c) => c.sortable);
  if (sortable.length === 0) return null;
  return (
    <div className="md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-11 gap-1.5 sm:h-9">
            <ArrowUpDownIcon className="size-4" />
            Sort
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {sortable.map((c) => {
            const active = sort.column === c.key;
            const nextDir: "asc" | "desc" = active && sort.dir === "asc" ? "desc" : "asc";
            return (
              <DropdownMenuItem key={c.key} onClick={() => sortNav(c.key, nextDir)}>
                <span className={cn(active && "font-medium")}>{c.label}</span>
                {active &&
                  (sort.dir === "asc" ? (
                    <ArrowUpIcon className="ml-auto size-3.5" />
                  ) : (
                    <ArrowDownIcon className="ml-auto size-3.5" />
                  ))}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function DataTable<Row, K extends string>({
  columns, rows, rowKey, renderRow, mobileCard, rowClassName,
  sort, serial = true, idAccessor, idHref, idLabel = "ID",
  search, filters, actions,
  emptyIcon: EmptyIcon, emptyMessage, emptySearchMessage, emptyAction,
}: DataTableProps<Row, K>) {
  const [searchValue, setSearchValue] = useSearchQuery();
  const router = useRouter();
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
        filters={filters}
        sort={sort ? <MobileSort columns={columns} sort={sort} /> : undefined}
        actions={actions}
      />
      <div className="hidden overflow-hidden rounded-lg border md:block">
        <Table>
          <TableHeader className={HEAD_STICKY}>
            <HeaderRow columns={columns} sort={sort} serial={serial} hasId={hasId} idLabel={idLabel} />
          </TableHeader>
          <TableBody>
            {filtered.length ? (
              filtered.map((r, i) => (
                <TableRow
                  key={rowKey(r)}
                  className={cn(idHref && "cursor-pointer", rowClassName?.(r))}
                  onClick={
                    idHref
                      ? (e) => {
                          // Whole row opens the detail — but don't hijack clicks on
                          // interactive controls (links, buttons, menus, inputs) inside it.
                          if (
                            (e.target as HTMLElement).closest(
                              'a,button,input,select,label,[role="button"],[role="menuitem"]',
                            )
                          )
                            return;
                          router.push(idHref(r));
                        }
                      : undefined
                  }
                >
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
                icon={EmptyIcon}
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
      <div className="space-y-3 md:hidden">
        {filtered.length ? (
          filtered.map((r) => (
            <MobileCard
              key={rowKey(r)}
              row={r}
              columns={columns}
              renderRow={renderRow}
              mobileCard={mobileCard}
              idAccessor={idAccessor}
              idHref={idHref}
              rowClassName={rowClassName}
            />
          ))
        ) : (
          <div className="grid place-items-center gap-3 rounded-lg border py-12 text-center">
            <span className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-xl">
              <EmptyIcon className="size-6" />
            </span>
            <p className="text-muted-foreground max-w-sm px-6">
              {searchValue ? emptySearchMessage ?? `No results match “${searchValue}”.` : emptyMessage}
            </p>
            {searchValue ? (
              <Button variant="outline" size="sm" onClick={() => setSearchValue("")}>Clear filters</Button>
            ) : (
              emptyAction
            )}
          </div>
        )}
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
      <div className="hidden overflow-hidden rounded-lg border md:block">
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
      <div className="space-y-3 md:hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="bg-card space-y-3 rounded-lg border p-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full max-w-56" />
          </div>
        ))}
      </div>
    </div>
  );
}

DataTable.Skeleton = DataTableSkeleton;
