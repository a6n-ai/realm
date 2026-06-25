"use client";

import { useState } from "react";
import Link from "next/link";
import { PackageIcon } from "lucide-react";
import {
  FilterBar, FilterPill, SearchInput, OrderStatusBadge, EmptyState, SortableHeader,
} from "@/components/ds";
import {
  Table, TableHeader, TableHead, TableBody, TableRow, TableCell,
} from "@/components/ui/table";
import { formatEpoch } from "@/lib/format/datetime";
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
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

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
        <EmptyState icon={PackageIcon} message="No orders match your filter." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader column="name" label="Name" currentSort={sort.column} currentDir={sort.dir} />
              <SortableHeader column="deployment" label="Deployment" currentSort={sort.column} currentDir={sort.dir} />
              <TableHead>City</TableHead>
              <SortableHeader column="status" label="Status" currentSort={sort.column} currentDir={sort.dir} />
              <SortableHeader column="start" label="Start" currentSort={sort.column} currentDir={sort.dir} />
              <SortableHeader column="total" label="Total" currentSort={sort.column} currentDir={sort.dir} />
              <SortableHeader column="created" label="Created" currentSort={sort.column} currentDir={sort.dir} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow key={o.publicId}>
                <TableCell className="font-medium">
                  <Link
                    href={`/dashboard/orders/${o.publicId}`}
                    className="hover:underline"
                  >
                    {o.fullName}
                  </Link>
                </TableCell>
                <TableCell>{o.deploymentId}</TableCell>
                <TableCell>{o.city}</TableCell>
                <TableCell>
                  <OrderStatusBadge status={o.status} />
                </TableCell>
                <TableCell>{o.startDate}</TableCell>
                <TableCell>{fmt(Number(o.total))}</TableCell>
                <TableCell>{formatEpoch(o.createdAt, { mode: "date" })}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
