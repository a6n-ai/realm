"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PackageIcon } from "lucide-react";
import { formatMoney as fmt } from "@foundry/commons";
import { DataTable, SearchInput, OrderStatusBadge, type Column } from "@/components/ds";
import { orderDisplayStatus } from "@/lib/orders/display-status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { TableCell } from "@foundry/ui/table";
import { cn } from "@foundry/ui/cn";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import type { getCustomerOrders } from "@/lib/services/customers.service";

type CustomerOrderRow = Awaited<ReturnType<typeof getCustomerOrders>>[number];

// Same DataTable + column shape as the standalone /dashboard/orders table (see
// orders-list.tsx) — this is a read-only, unpaginated slice scoped to one customer,
// so it drops the Owner/reassign column that table has (no owner data on this view).
type Key = "name" | "status" | "start" | "total" | "paid" | "due" | "created";
export const CUSTOMER_ORDERS_COLUMNS: readonly Column<Key>[] = [
  { key: "name", label: "Plan", sortable: false, width: "w-72" },
  { key: "status", label: "Status" },
  { key: "start", label: "Start", align: "right" },
  { key: "total", label: "Total", align: "right" },
  { key: "created", label: "Created", align: "right" },
];
// Paid and Due only reach the page for finance:read (getCustomerOrders leaves them null otherwise).
const WITH_PAYMENTS: readonly Column<Key>[] = [
  ...CUSTOMER_ORDERS_COLUMNS.slice(0, 4),
  { key: "paid", label: "Paid", align: "right" },
  { key: "due", label: "Due", align: "right" },
  CUSTOMER_ORDERS_COLUMNS[4]!,
];

// Local state, not DataTable's URL-bound `search` prop — this page mounts two
// DataTables (Orders + Inquiries) that would otherwise fight over the same "q"
// query param. Small unpaginated per-customer list, so filtering in JS is fine.
export function CustomerOrdersTable({ orders }: { orders: CustomerOrderRow[] }) {
  const tz = useTimezone();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const showPayments = orders.some((o) => o.paid != null);
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
      pagination="client"
      columns={showPayments ? WITH_PAYMENTS : CUSTOMER_ORDERS_COLUMNS}
      rows={filtered}
      rowKey={(o) => o.publicId}
      // The short deployment ID sits under the plan name, not in its own column; idHref keeps rows clickable.
      idHref={(o) => `/dashboard/orders/${o.publicId}`}
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
            <p className="text-muted-foreground truncate text-xs font-normal">
              {o.deploymentId}
              {o.city ? ` · ${o.city}` : ""}
            </p>
          </TableCell>
          <TableCell>
            <OrderStatusBadge status={orderDisplayStatus(o.status, [o.paymentStatus])} />
          </TableCell>
          <TableCell className="text-right tabular-nums">{o.startDate}</TableCell>
          <TableCell className="text-right tabular-nums">{fmt(Number(o.total))}</TableCell>
          {showPayments ? (
            <>
              <TableCell className="text-right tabular-nums">{fmt(o.paid ?? 0)}</TableCell>
              <TableCell className={cn("text-right tabular-nums", (o.due ?? 0) > 0 ? "text-destructive font-medium" : "text-muted-foreground")}>
                {o.due == null ? "—" : fmt(o.due)}
              </TableCell>
            </>
          ) : null}
          <TableCell className="text-right tabular-nums">
            {formatEpoch(o.createdAt, { mode: "date", timeZone: tz })}
          </TableCell>
        </>
      )}
    />
  );
}
