"use client";

import Link from "next/link";
import { CreditCardIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { DataTable, ListPagination, ListSearchFilters, type Column, type FacetDef } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import type { SortState } from "@/lib/list/sort";
import { PAYMENT_STATUS_LABEL, paymentBadgeVariant } from "@/lib/payments/labels";
import type { PaymentPageRow, PaymentSortColumn } from "@/lib/services/payments.service";
import { PaymentReviewButtons } from "../sessions/payment-review-buttons";

export type PaymentTableRow = PaymentPageRow & { whenLabel: string };

const COLUMNS: readonly Column<PaymentSortColumn | "method" | "family" | "booking" | "reference" | "actions">[] = [
  { key: "time", label: "Time", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "method", label: "Method" },
  { key: "family", label: "Customer" },
  { key: "booking", label: "Booking" },
  { key: "reference", label: "Reference" },
  { key: "amount", label: "Amount", sortable: true, align: "right" },
  { key: "actions", label: "", align: "right" },
];

export function PaymentsTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
  canReview,
  emptyMessage,
}: {
  spec: FacetDef[];
  rows: PaymentTableRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<PaymentSortColumn>;
  canReview: boolean;
  emptyMessage: string;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        serialOffset={page * size}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        idAccessor={(r) => r.publicId}
        idLabel="Payment"
        filters={<ListSearchFilters spec={spec} placeholder="Search customer or reference…" shortPlaceholder="Search…" />}
        emptyIcon={CreditCardIcon}
        emptyMessage={emptyMessage}
        emptySearchMessage="No payments match your search."
        renderRow={(r) => (
          <>
            <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">{r.whenLabel}</TableCell>
            <TableCell>
              <Badge variant={paymentBadgeVariant(r.status)}>{PAYMENT_STATUS_LABEL[r.status] ?? r.status}</Badge>
            </TableCell>
            <TableCell className="capitalize">{r.method}</TableCell>
            <TableCell>
              <Link href={`/dashboard/customers/${r.customerPublicId}`} className="font-medium hover:underline">
                {r.customerName ?? r.customerEmail ?? "Unknown"}
              </Link>
              {r.customerName && r.customerEmail ? (
                <div className="text-muted-foreground text-xs">{r.customerEmail}</div>
              ) : null}
            </TableCell>
            <TableCell>
              <Link href={`/dashboard/sessions/${r.occurrencePublicId}`} className="font-mono text-xs hover:underline">
                {r.bookingPublicId}
              </Link>
            </TableCell>
            <TableCell className="font-mono text-xs">{r.reference ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(Number(r.amount), r.currency)}</TableCell>
            <TableCell className="text-right">
              {canReview ? <PaymentReviewButtons publicId={r.publicId} status={r.status} /> : null}
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function PaymentsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
