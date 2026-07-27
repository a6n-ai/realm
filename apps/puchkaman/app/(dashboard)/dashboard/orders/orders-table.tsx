"use client";

import Link from "next/link";
import { PackageIcon } from "lucide-react";
import {
  DataTable,
  ListPagination,
  type Column,
  type FacetDef,
} from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { TableCell } from "@realm/ui/table";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import type { OrderListRow, OrderSortColumn } from "@/lib/services/orders.service";

type Row = OrderListRow & { totalLabel: string };

// Sortable keys must match OrderSortColumn. "clover" / "payment" are display-only.
type OrderCol = OrderSortColumn | "clover" | "payment";

const COLUMNS: readonly Column<OrderCol>[] = [
  { key: "customer", label: "Customer", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "payment", label: "Payment", sortable: false },
  { key: "clover", label: "Clover", sortable: false },
  { key: "total", label: "Total", sortable: true, align: "right" },
  { key: "created", label: "Created", sortable: true, align: "right" },
  { key: "paidAt", label: "Paid", sortable: true, align: "right" },
];

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "paid":
    case "fulfilled":
      return "default";
    case "pending":
    case "awaiting_payment":
    case "pending_verification":
      return "secondary";
    case "failed":
    case "cancelled":
    case "rejected":
      return "destructive";
    case "refunded":
      return "outline";
    default:
      return "outline";
  }
}

function formatLabel(raw: string | null): string {
  if (!raw) return "—";
  return raw.replaceAll("_", " ");
}

export function OrdersTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: Row[];
  total: number;
  page: number;
  size: number;
  sort: SortState<OrderSortColumn>;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        sort={sort}
        idHref={(r) => `/dashboard/orders/${r.publicId}`}
        search={{
          placeholder: "Search order id or customer…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={PackageIcon}
        emptyMessage="No orders yet."
        emptySearchMessage="No orders match your filters."
        renderRow={(r) => (
          <>
            <TableCell>
              <Link
                href={`/dashboard/orders/${r.publicId}`}
                className="font-medium hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {r.customerName}
              </Link>
              <div className="text-muted-foreground text-xs">{r.customerEmail}</div>
              <div className="text-muted-foreground font-mono text-[10px]">{r.publicId}</div>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-0.5">
                <Badge variant={statusVariant(r.paymentStatus ?? "")} className="w-fit">
                  {formatLabel(r.paymentStatus)}
                </Badge>
                <span className="text-muted-foreground text-xs capitalize">
                  {formatLabel(r.paymentMethod)}
                </span>
              </div>
            </TableCell>
            <TableCell className="font-mono text-xs">{r.cloverOrderId ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{r.totalLabel}</TableCell>
            <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
              {new Date(r.createdAt).toLocaleString()}
            </TableCell>
            <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
              {r.paidAt ? new Date(r.paidAt).toLocaleString() : "—"}
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function OrdersTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} serial={false} />;
}
