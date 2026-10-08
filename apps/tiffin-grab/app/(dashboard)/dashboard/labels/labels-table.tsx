"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDownIcon, ChevronUpIcon, ChevronsUpDownIcon, PackageOpenIcon } from "lucide-react";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { FilterBar, ListPagination, SearchInput, useListNavPending, useSortNav } from "@/components/ds";
import { sortRows } from "@/lib/list/sort";
import type { KitchenPackingSheet, KitchenPackingRow } from "@/lib/services/kitchen-packing-sheet.service";
import { useTableParams } from "./use-table-params";

type ColKey = string;

type ColDef = {
  key: ColKey;
  label: string;
  align?: "right";
  defaultWidth: number;
  minWidth: number;
  sticky?: "customer";
};

const META_COLS: ColDef[] = [
  { key: "customer", label: "Customer", defaultWidth: 168, minWidth: 110, sticky: "customer" },
  { key: "deliveryId", label: "Delivery ID", defaultWidth: 132, minWidth: 96 },
  { key: "phone", label: "Phone", defaultWidth: 136, minWidth: 110 },
  { key: "driver", label: "Driver", defaultWidth: 112, minWidth: 80 },
  { key: "stop", label: "Stop #", align: "right", defaultWidth: 72, minWidth: 56 },
  { key: "orderId", label: "Order ID", defaultWidth: 124, minWidth: 96 },
  { key: "planName", label: "Plan", defaultWidth: 148, minWidth: 108 },
  { key: "mealSize", label: "Meal size", defaultWidth: 200, minWidth: 140 },
];

const SERIAL_WIDTH = 48;
const ITEM_DEFAULT = 148;
const ITEM_MIN = 96;
const WIDTHS_STORAGE_KEY = "tg.packing-sheet.col-widths.v1";

function cellValue(r: KitchenPackingRow, column: ColKey, itemHeaders: string[]): string | number {
  switch (column) {
    case "customer":
      return r.forLabel ? `${r.customerName} · ${r.forLabel}` : r.customerName;
    case "deliveryId":
      return r.deliveryPublicId;
    case "phone":
      return r.phone ?? "";
    case "driver":
      return r.routeDriver ?? "";
    case "stop":
      return r.routeStopNumber ?? "";
    case "orderId":
      return r.orderId;
    case "planName":
      return r.planName;
    case "mealSize":
      return r.mealSizeName;
    default:
      return r.items[itemHeaders.indexOf(column)] ?? "";
  }
}

function loadStoredWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(WIDTHS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function useColumnWidths(cols: ColDef[]) {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const drag = useRef<{ key: string; startX: number; startW: number; min: number } | null>(null);

  useEffect(() => {
    setWidths(loadStoredWidths());
  }, []);

  const widthOf = useCallback(
    (c: ColDef) => Math.max(c.minWidth, widths[c.key] ?? c.defaultWidth),
    [widths],
  );

  const onResizeStart = useCallback(
    (key: string, minWidth: number, startWidth: number) => (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { key, startX: e.clientX, startW: startWidth, min: minWidth };
    },
    [],
  );

  const onResizeMove = useCallback((e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const next = Math.max(d.min, Math.round(d.startW + (e.clientX - d.startX)));
    setWidths((prev) => ({ ...prev, [d.key]: next }));
  }, []);

  const onResizeEnd = useCallback((e: ReactPointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    setWidths((prev) => {
      try {
        localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(prev));
      } catch {
        /* private mode */
      }
      return prev;
    });
  }, []);

  const tableMinWidth = useMemo(
    () => SERIAL_WIDTH + cols.reduce((n, c) => n + widthOf(c), 0),
    [cols, widthOf],
  );

  return { widthOf, onResizeStart, onResizeMove, onResizeEnd, tableMinWidth };
}

function PackingSortHead({
  column,
  label,
  align,
  currentSort,
  currentDir,
  width,
  stickyLeft,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: {
  column: string;
  label: string;
  align?: "right";
  currentSort: string;
  currentDir: "asc" | "desc";
  width: number;
  stickyLeft?: number;
  onResizeStart: (e: ReactPointerEvent) => void;
  onResizeMove: (e: ReactPointerEvent) => void;
  onResizeEnd: (e: ReactPointerEvent) => void;
}) {
  const sortNav = useSortNav();
  const active = currentSort === column;
  const nextDir = active && currentDir === "asc" ? "desc" : "asc";
  const Icon = active ? (currentDir === "asc" ? ChevronUpIcon : ChevronDownIcon) : ChevronsUpDownIcon;

  return (
    <TableHead
      className={cn(
        "bg-muted/40 sticky top-0 relative z-20",
        stickyLeft != null && "z-30 shadow-[1px_0_0_0_var(--border)]",
        align === "right" && "text-right",
      )}
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        ...(stickyLeft != null ? { left: stickyLeft } : {}),
      }}
      aria-sort={active ? (currentDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => sortNav(column, nextDir)}
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:text-foreground",
          align === "right" && "flex-row-reverse",
        )}
        data-active={active}
      >
        <span className="truncate">{label}</span>
        <Icon className="size-3.5 shrink-0" />
      </button>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label}`}
        className="absolute inset-y-0 right-0 z-40 w-2 cursor-col-resize touch-none select-none after:absolute after:inset-y-2 after:right-[3px] after:w-px after:bg-border/80 after:opacity-0 hover:after:opacity-100"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onClick={(e) => e.stopPropagation()}
      />
    </TableHead>
  );
}

function clippedTitle(e: React.MouseEvent | React.FocusEvent) {
  const el = (e.target as HTMLElement).closest("[data-pack-cell]") as HTMLElement | null;
  if (!el || el.title) return;
  if (el.scrollWidth > el.clientWidth) el.title = el.textContent?.trim() ?? "";
}

export function LabelsTable({ sheet }: { sheet: KitchenPackingSheet }) {
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [searchValue, setSearchValue] = useState("");
  const loading = useListNavPending();

  const columns = useMemo<ColDef[]>(
    () => [
      ...META_COLS,
      ...sheet.itemHeaders.map((header) => ({
        key: header,
        label: header.replace(/^Item(?=\d)/, "Item "),
        defaultWidth: ITEM_DEFAULT,
        minWidth: ITEM_MIN,
      })),
    ],
    [sheet.itemHeaders],
  );

  const { sort, pagination } = useTableParams<string>(
    columns.map((c) => c.key),
    { column: "customer", dir: "asc" },
  );
  const { widthOf, onResizeStart, onResizeMove, onResizeEnd, tableMinWidth } = useColumnWidths(columns);

  const plans = useMemo(() => Array.from(new Set(sheet.rows.map((r) => r.planName))).sort(), [sheet.rows]);

  const shownRows = useMemo(() => {
    const filtered = (planFilter === "all" ? sheet.rows : sheet.rows.filter((r) => r.planName === planFilter)).filter(
      (r) => {
        const q = searchValue.trim().toLowerCase();
        if (!q) return true;
        return [r.customerName, r.phone, r.routeDriver, r.orderId, r.planName, r.mealSizeName]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      },
    );
    return sortRows(filtered, sort, (r, column) => cellValue(r, column, sheet.itemHeaders));
  }, [planFilter, sheet.rows, sheet.itemHeaders, sort, searchValue]);

  const pageCount = Math.max(1, Math.ceil(shownRows.length / pagination.size));
  const safePage = Math.min(Math.max(0, pagination.page), pageCount - 1);
  const displayRows = shownRows.slice(safePage * pagination.size, (safePage + 1) * pagination.size);
  const serialOffset = safePage * pagination.size;

  if (sheet.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
        <PackageOpenIcon className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">No tiffin deliveries scheduled for this date</p>
        <p className="text-muted-foreground text-xs">Pick a different date above.</p>
      </div>
    );
  }

  const planCount = (plan: string) => sheet.rows.filter((r) => r.planName === plan).length;
  const customerLeft = SERIAL_WIDTH;

  return (
    <div key={sheet.dateIso} className="space-y-4">
      <FilterBar
        search={
          <SearchInput
            value={searchValue}
            onChange={setSearchValue}
            placeholder="Search customer, phone, driver, order…"
            shortPlaceholder="Search…"
          />
        }
        filters={
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={planFilter === "all" ? "default" : "outline"} onClick={() => setPlanFilter("all")}>
              All plans <span className="tabular-nums opacity-70">{sheet.rows.length}</span>
            </Button>
            {plans.map((p) => (
              <Button key={p} size="sm" variant={planFilter === p ? "default" : "outline"} onClick={() => setPlanFilter(p)}>
                {p} <span className="tabular-nums opacity-70">{planCount(p)}</span>
              </Button>
            ))}
          </div>
        }
      />

      <div aria-busy={loading} className={cn("hidden rounded-lg border transition-opacity md:block", loading && "opacity-60")}>
        <div className="overflow-x-auto overscroll-x-contain touch-pan-x [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
          <table
            className="caption-bottom border-separate border-spacing-0 text-sm table-fixed"
            style={{ width: tableMinWidth, minWidth: tableMinWidth }}
          >
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  className="bg-muted/40 sticky top-0 left-0 z-30 text-right shadow-[1px_0_0_0_var(--border)]"
                  style={{ width: SERIAL_WIDTH, minWidth: SERIAL_WIDTH, maxWidth: SERIAL_WIDTH }}
                >
                  #
                </TableHead>
                {columns.map((c) => {
                  const w = widthOf(c);
                  return (
                    <PackingSortHead
                      key={c.key}
                      column={c.key}
                      label={c.label}
                      align={c.align}
                      currentSort={sort.column}
                      currentDir={sort.dir}
                      width={w}
                      stickyLeft={c.sticky === "customer" ? customerLeft : undefined}
                      onResizeStart={onResizeStart(c.key, c.minWidth, w)}
                      onResizeMove={onResizeMove}
                      onResizeEnd={onResizeEnd}
                    />
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody onMouseOver={clippedTitle} onFocus={clippedTitle}>
              {displayRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="h-32 text-center text-muted-foreground">
                    No rows match this filter.
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((row, i) => (
                  <TableRow key={`${row.deliveryPublicId}-${row.forDate}-${serialOffset + i}`}>
                    <TableCell
                      className="bg-background sticky left-0 z-10 text-right tabular-nums text-muted-foreground shadow-[1px_0_0_0_var(--border)]"
                      style={{ width: SERIAL_WIDTH, minWidth: SERIAL_WIDTH, maxWidth: SERIAL_WIDTH }}
                    >
                      {serialOffset + i + 1}
                    </TableCell>
                    {columns.map((c) => {
                      const raw = cellValue(row, c.key, sheet.itemHeaders);
                      const text = raw === "" || raw == null ? "—" : String(raw);
                      const isCustomer = c.sticky === "customer";
                      const w = widthOf(c);
                      return (
                        <TableCell
                          key={c.key}
                          data-pack-cell
                          className={cn(
                            "overflow-hidden text-ellipsis whitespace-nowrap",
                            c.align === "right" && "text-right tabular-nums",
                            (c.key === "orderId" || c.key === "deliveryId") && "font-mono text-xs",
                            c.key === "phone" && "tabular-nums",
                            isCustomer && "bg-background sticky z-10 font-medium shadow-[1px_0_0_0_var(--border)]",
                          )}
                          style={{
                            width: w,
                            minWidth: w,
                            maxWidth: w,
                            ...(isCustomer ? { left: customerLeft } : {}),
                          }}
                        >
                          {isCustomer ? (
                            <>
                              {row.customerName}
                              {row.forLabel ? (
                                <span className="text-muted-foreground font-normal"> · {row.forLabel}</span>
                              ) : null}
                            </>
                          ) : (
                            text
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </table>
        </div>
      </div>

      <div aria-busy={loading} className={cn("space-y-3 transition-opacity md:hidden", loading && "opacity-60")}>
        {displayRows.map((row, i) => (
          <div key={`${row.deliveryPublicId}-${row.forDate}-${serialOffset + i}`} className="bg-card rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs tabular-nums">#{serialOffset + i + 1}</p>
                <p className="text-base font-medium">
                  {row.customerName}
                  {row.forLabel ? <span className="text-muted-foreground font-normal"> · {row.forLabel}</span> : null}
                </p>
                <p className="text-muted-foreground mt-0.5 font-mono text-xs">{row.orderId}</p>
              </div>
              {row.routeStopNumber != null ? (
                <p className="text-muted-foreground shrink-0 text-sm tabular-nums">Stop {row.routeStopNumber}</p>
              ) : null}
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="min-w-0 text-right tabular-nums">{row.phone ?? "—"}</dd>
              <dt className="text-muted-foreground">Driver</dt>
              <dd className="min-w-0 text-right break-words">{row.routeDriver ?? "—"}</dd>
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="min-w-0 text-right break-words">{row.planName}</dd>
              <dt className="text-muted-foreground">Meal size</dt>
              <dd className="min-w-0 text-right break-words">{row.mealSizeName}</dd>
            </dl>
            {row.items.some((x) => x && x !== "—") ? (
              <ul className="mt-3 space-y-1 border-t pt-3 text-sm">
                {row.items.map((item, idx) =>
                  item && item !== "—" ? (
                    <li key={sheet.itemHeaders[idx] ?? idx} className="flex justify-between gap-3">
                      <span className="text-muted-foreground shrink-0">
                        {sheet.itemHeaders[idx]?.replace(/^Item(?=\d)/, "Item ") ?? `Item ${idx + 1}`}
                      </span>
                      <span className="min-w-0 text-right font-medium break-words">{item}</span>
                    </li>
                  ) : null,
                )}
              </ul>
            ) : null}
          </div>
        ))}
      </div>

      <ListPagination page={safePage} size={pagination.size} total={shownRows.length} />
    </div>
  );
}
