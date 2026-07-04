"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronRightIcon, PackageIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
import { formatMoney as fmt } from "@realm/commons";
import {
  FilterBar, FilterPill, SearchInput, OrderStatusBadge, EmptyState, SortableHeader,
} from "@/components/ds";
import {
  Table, TableHeader, TableHead, TableBody, TableRow, TableCell,
} from "@realm/ui/table";
import { cn } from "@/lib/utils";
import { formatEpoch } from "@/lib/format/datetime";
import { useUrlState, useClearUrlKeys } from "@/lib/list/use-url-state";
import type { OrderListRow, OrderSortColumn } from "@/lib/services/orders.service";
import type { SortState } from "@/lib/list/sort";

const STATUS_PILLS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "waitlisted", label: "Waitlisted" },
  { key: "paused", label: "Paused" },
  { key: "cancelled", label: "Cancelled" },
] as const;

// Single source of truth for the table's columns. The real header, and the
// skeleton below, both render from this — change a column here and both update,
// so the loading skeleton can never drift from the component.
const COLUMNS = [
  { key: "name", label: "Name", sortable: true },
  { key: "deployment", label: "Deployment", sortable: true },
  { key: "city", label: "City" },
  { key: "status", label: "Status", sortable: true },
  { key: "start", label: "Start", sortable: true, align: "right" },
  { key: "total", label: "Total", sortable: true, align: "right" },
  { key: "created", label: "Created", sortable: true, align: "right" },
  { key: "chevron", label: "", width: "w-8" },
] as const;


export function OrdersList({
  rows,
  sort,
}: {
  rows: OrderListRow[];
  sort: SortState<OrderSortColumn>;
}) {
  const [search, setSearch] = useUrlState("q", "");
  const [status, setStatus] = useUrlState("status", "all");

  const clearUrlKeys = useClearUrlKeys();
  const hasFilters = !!search || status !== "all";
  const clearFilters = () => clearUrlKeys(["q", "status"]);

  // One pass over rows for all pill counts; search-independent so it only
  // recomputes when rows change, not on every keystroke.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const countOf = (s: string) => (s === "all" ? rows.length : counts[s] ?? 0);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      const matchStatus = status === "all" || r.status === status;
      const matchSearch =
        !q ||
        r.fullName.toLowerCase().includes(q) ||
        r.deploymentId.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [rows, status, search]);

  return (
    <div className="space-y-4">
      <FilterBar
        search={
          <SearchInput value={search} onChange={setSearch} placeholder="Search orders…" />
        }
        filters={
          <>
            {STATUS_PILLS.map((p) => (
              <FilterPill
                key={p.key}
                label={p.label}
                active={status === p.key}
                count={countOf(p.key)}
                onClick={() => setStatus(p.key)}
              />
            ))}
          </>
        }
      />
      {filtered.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={PackageIcon}
            message="No orders match your filter."
            action={
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState icon={PackageIcon} message="No orders yet." />
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) =>
                "sortable" in c && c.sortable ? (
                  <SortableHeader
                    key={c.key}
                    column={c.key as OrderSortColumn}
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
            {filtered.map((o) => (
              <TableRow key={o.publicId} className="group cursor-pointer">
                <TableCell className="font-medium">
                  <Link
                    href={`/dashboard/orders/${o.publicId}`}
                    className="group-hover:underline"
                  >
                    {o.fullName}
                  </Link>
                </TableCell>
                <TableCell>{o.deploymentId}</TableCell>
                <TableCell>{o.city}</TableCell>
                <TableCell>
                  <OrderStatusBadge status={o.status} />
                </TableCell>
                <TableCell className="text-right"><span className="nums">{o.startDate}</span></TableCell>
                <TableCell className="text-right"><span className="nums">{fmt(Number(o.total))}</span></TableCell>
                <TableCell className="text-right"><span className="nums">{formatEpoch(o.createdAt, { mode: "date" })}</span></TableCell>
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

// Exact loading twin: same COLUMNS + same FilterBar/Table markup, grey cells
// instead of data. Rendered as the page's <Suspense fallback>, so it always
// matches OrdersList by construction.
export function OrdersListSkeleton() {
  return (
    <div className="space-y-4">
      <FilterBar
        search={<Skeleton className="h-9 w-full" />}
        filters={STATUS_PILLS.map((p) => (
          <Skeleton key={p.key} className="h-8 w-16 rounded-full" />
        ))}
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
