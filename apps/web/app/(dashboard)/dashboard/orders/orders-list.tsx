"use client";

import Link from "next/link";
import { ChevronRightIcon, PackageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FilterBar, FilterPill, SearchInput, OrderStatusBadge, EmptyState, SortableHeader,
} from "@/components/ds";
import {
  Table, TableHeader, TableHead, TableBody, TableRow, TableCell,
} from "@/components/ui/table";
import { formatEpoch } from "@/lib/format/datetime";
import { useUrlState } from "@/lib/list/use-url-state";
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

const fmt = (n: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);

export function OrdersList({
  rows,
  sort,
}: {
  rows: OrderListRow[];
  sort: SortState<OrderSortColumn>;
}) {
  const [search, setSearch] = useUrlState("q", "");
  const [status, setStatus] = useUrlState("status", "all");

  const hasFilters = !!search || status !== "all";
  const clearFilters = () => {
    setSearch("");
    setStatus("all");
  };

  const countOf = (s: string) =>
    s === "all" ? rows.length : rows.filter((r) => r.status === s).length;

  const filtered = rows.filter((r) => {
    const matchStatus = status === "all" || r.status === status;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.fullName.toLowerCase().includes(q) ||
      r.deploymentId.toLowerCase().includes(q) ||
      r.city.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

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
              <SortableHeader column="name" label="Name" currentSort={sort.column} currentDir={sort.dir} />
              <SortableHeader column="deployment" label="Deployment" currentSort={sort.column} currentDir={sort.dir} />
              <TableHead>City</TableHead>
              <SortableHeader column="status" label="Status" currentSort={sort.column} currentDir={sort.dir} />
              <SortableHeader column="start" label="Start" currentSort={sort.column} currentDir={sort.dir} className="text-right" />
              <SortableHeader column="total" label="Total" currentSort={sort.column} currentDir={sort.dir} className="text-right" />
              <SortableHeader column="created" label="Created" currentSort={sort.column} currentDir={sort.dir} className="text-right" />
              <TableHead className="w-8" />
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
