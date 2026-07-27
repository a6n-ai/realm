"use client";

import Link from "next/link";
import { CreditCardIcon } from "lucide-react";
import {
  DataTable,
  ListPagination,
  SkeletonFilterBar,
  type Column,
  type FacetDef,
} from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { TableCell } from "@realm/ui/table";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import type { PaymentListRow, PaymentSortColumn } from "@/lib/services/payments.service";

type Row = PaymentListRow & { amountLabel: string };

type PaymentCol = PaymentSortColumn | "order" | "clover";

const COLUMNS: readonly Column<PaymentCol>[] = [
  { key: "customer", label: "Customer", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "method", label: "Method", sortable: true },
  { key: "order", label: "Order", sortable: false },
  { key: "clover", label: "Clover charge", sortable: false },
  { key: "amount", label: "Amount", sortable: true, align: "right" },
  { key: "created", label: "Created", sortable: true, align: "right" },
  { key: "capturedAt", label: "Captured", sortable: true, align: "right" },
];

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "paid":
      return "default";
    case "awaiting_payment":
    case "pending_verification":
      return "secondary";
    case "failed":
    case "rejected":
    case "refunded":
      return "destructive";
    default:
      return "outline";
  }
}

function formatLabel(raw: string): string {
  return raw.replaceAll("_", " ");
}

export function TransactionsTable({
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
  sort: SortState<PaymentSortColumn>;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        sort={sort}
        idHref={(r) => `/dashboard/orders/${r.orderPublicId}`}
        search={{
          placeholder: "Search payment, order, or customer…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={CreditCardIcon}
        emptyMessage="No payments yet."
        emptySearchMessage="No payments match your filters."
        renderRow={(r) => (
          <>
            <TableCell>
              <div className="font-medium">{r.customerName}</div>
              <div className="text-muted-foreground text-xs">{r.customerEmail}</div>
              <div className="text-muted-foreground font-mono text-[10px]">{r.publicId}</div>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant(r.status)}>{formatLabel(r.status)}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm capitalize">{r.method}</TableCell>
            <TableCell>
              <Link
                href={`/dashboard/orders/${r.orderPublicId}`}
                className="font-mono text-xs hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {r.orderPublicId}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">
              {r.cloverChargeId ?? "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.amountLabel}</TableCell>
            <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
              {new Date(r.createdAt).toLocaleString()}
            </TableCell>
            <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
              {r.capturedAt ? new Date(r.capturedAt).toLocaleString() : "—"}
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function TransactionsTableSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonFilterBar dropdown />
      <DataTable.Skeleton columns={COLUMNS} serial={false} />
    </div>
  );
}
