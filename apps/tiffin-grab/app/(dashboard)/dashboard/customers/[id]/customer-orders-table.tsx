"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PackageIcon } from "lucide-react";
import { formatMoney as fmt } from "@foundry/commons";
import { DataTable, SearchInput, OrderStatusBadge, type Column } from "@/components/ds";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { TableCell } from "@foundry/ui/table";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { getCustomer360 } from "@/lib/services/customers.service";

type CustomerOrderRow = Awaited<ReturnType<typeof getCustomer360>>["orders"][number];

// Same DataTable + column shape as the standalone /dashboard/orders table (see
// orders-list.tsx) — this is a read-only, unpaginated slice scoped to one customer,
// so it drops the Owner/reassign column that table has (no owner data on this view).
export const CUSTOMER_ORDERS_COLUMNS: readonly Column<"name" | "city" | "status" | "start" | "total" | "created">[] = [
  { key: "name", label: "Plan", sortable: false },
  { key: "city", label: "City" },
  { key: "status", label: "Status" },
  { key: "start", label: "Start", align: "right" },
  { key: "total", label: "Total", align: "right" },
  { key: "created", label: "Created", align: "right" },
];

// Local state, not DataTable's URL-bound `search` prop — this page mounts two
// DataTables (Orders + Inquiries) that would otherwise fight over the same "q"
// query param. Small unpaginated per-customer list, so filtering in JS is fine.
export function CustomerOrdersTable({ orders }: { orders: CustomerOrderRow[] }) {
  const tz = useTimezone();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const statuses = useMemo(() => [...new Set(orders.map((o) => o.status))], [orders]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (!needle) return true;
      return [o.planName, o.deploymentId, o.city].some((v) => v.toLowerCase().includes(needle));
    });
  }, [orders, q, status]);

  return (
    <DataTable
      columns={CUSTOMER_ORDERS_COLUMNS}
      rows={filtered}
      rowKey={(o) => o.publicId}
      idAccessor={(o) => o.deploymentId}
      idHref={(o) => `/dashboard/orders/${o.publicId}`}
      idLabel="Deployment"
      rowClassName={() => "group cursor-pointer"}
      emptyIcon={PackageIcon}
      emptyMessage="No orders for this customer."
      emptySearchMessage="No orders match your search."
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search orders…" shortPlaceholder="Search…" />
          {orders.length > 0 && (
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger size="sm" className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      }
      renderRow={(o) => (
        <>
          <TableCell className="font-medium">
            <Link href={`/dashboard/orders/${o.publicId}`} className="group-hover:underline">
              {o.planName}
            </Link>
          </TableCell>
          <TableCell>{o.city}</TableCell>
          <TableCell>
            <OrderStatusBadge status={o.status} />
          </TableCell>
          <TableCell className="text-right tabular-nums">{o.startDate}</TableCell>
          <TableCell className="text-right tabular-nums">{fmt(Number(o.total))}</TableCell>
          <TableCell className="text-right tabular-nums">
            {formatEpoch(o.createdAt, { mode: "date", timeZone: tz })}
          </TableCell>
        </>
      )}
    />
  );
}
