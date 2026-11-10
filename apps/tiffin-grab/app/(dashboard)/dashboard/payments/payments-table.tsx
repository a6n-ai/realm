"use client";

import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import Link from "next/link";
import { inStatuses, UNPAID } from "@/lib/payments/status";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EyeIcon, MailIcon, ReceiptTextIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { TableCell } from "@foundry/ui/table";
import { DataTable, ListPagination, RowActions, RowActionTooltipButton, type Column } from "@/components/ds";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { ListSearchFilters } from "@/components/filters/reui-facet-filters";
import type { FacetDef, Option } from "@/components/ds";
import { DatedByChip } from "./dated-by-chip";
import { PaymentStatusPill } from "./payment-status-pill";
import { PaymentDetailDialog } from "./payment-detail-dialog";
import { CustomerLink } from "./customer-link";
import { MethodName, StripeMark } from "@/components/payments/stripe-mark";
import { methodLabel, PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_OPTIONS, type PaymentRow, type PaymentSortKey } from "./payment-facets";
import type { SortState } from "@foundry/design-system/list-sort";
import { sendPaymentReminderAction } from "../orders/[id]/actions";

/** "all" is the Payments listing (who paid); "customer" is one customer's tab (which order it paid for). */
type Scope = "all" | "customer";

const columnsFor = (scope: Scope): readonly Column<PaymentSortKey | "actions">[] => [
  { key: "time", label: "Time", sortable: true },
  scope === "all" ? { key: "customer", label: "Customer", sortable: true } : { key: "order", label: "Order", sortable: true },
  { key: "method", label: "Method", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "amount", label: "Amount", sortable: true, align: "right" },
  { key: "actions", label: "", align: "right" },
];

const buildSpec = (scope: Scope, ownerOptions: Option[]): FacetDef[] => [
  { kind: "multi", field: "status", label: "Status", options: [...PAYMENT_STATUS_OPTIONS] },
  { kind: "multi", field: "method", label: "Method", options: PAYMENT_METHOD_OPTIONS.map((o) => (o.value === "stripe" ? { ...o, icon: <StripeMark /> } : o)) },
  ...(scope === "all"
    ? ([
        { kind: "select", field: "owner", label: "Owner", options: ownerOptions },
        { kind: "dateRange", field: "createdAt", label: "Created" },
      ] satisfies FacetDef[])
    : []),
  { kind: "search", fields: [] },
];

export function PaymentsTable({
  rows,
  total,
  page,
  size,
  sort,
  ownerOptions = [],
  scope = "all",
}: {
  rows: PaymentRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<PaymentSortKey>;
  ownerOptions?: Option[];
  scope?: Scope;
}) {
  const tz = useTimezone();
  const [viewing, setViewing] = useState<PaymentRow | null>(null);
  const router = useRouter();
  const [reminding, startRemind] = useTransition();

  // Same staff-triggered reminder as order detail: a sign-in link to Bills,
  // with e-Transfer instructions + screenshot upload when that's the method.
  function remind(r: PaymentRow) {
    if (reminding) return;
    startRemind(async () => {
      const res = await sendPaymentReminderAction(r.orderPublicId, r.publicId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Payment reminder emailed", {
        description: `Sent to ${r.email ?? "the customer"}. If it doesn't arrive, ask them to check spam.`,
      });
      router.refresh();
    });
  }
  return (
    <div className="space-y-4">
    <DataTable
      serialOffset={pageOffset(page, size)}
      columns={columnsFor(scope)}
      rows={rows}
      rowKey={(r) => r.publicId}
      sort={sort as SortState<PaymentSortKey | "actions">}
      idAccessor={(r) => r.publicId}
      onRowClick={setViewing}
      rowClassName={() => "group/row"}
      filters={
        <>
          <ListSearchFilters spec={buildSpec(scope, ownerOptions)} placeholder={scope === "all" ? "Search order, customer, reference…" : "Search order, reference…"} shortPlaceholder="Search…" dateControl="external" />
          {scope === "all" && <DatedByChip />}
        </>
      }
      emptyIcon={ReceiptTextIcon}
      emptyMessage="No payments yet."
      emptySearchMessage="No payments match your search."
      renderRow={(r) => (
        <>
          <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
            {formatEpoch(r.createdAt, { mode: "datetime", timeZone: tz })}
          </TableCell>
          {scope === "all" ? (
            <TableCell className="text-muted-foreground"><CustomerLink row={r} /></TableCell>
          ) : (
            <TableCell className="font-medium">
              <Link href={`/dashboard/orders/${r.orderPublicId}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                {r.orderPublicId}
              </Link>
              {r.isAddon && <span className="text-muted-foreground ml-1.5 text-xs font-normal">Add-ons</span>}
            </TableCell>
          )}
          <TableCell><MethodName method={r.method}>{methodLabel(r.method)}</MethodName></TableCell>
          <TableCell>
            <PaymentStatusPill status={r.status} />
          </TableCell>
          <TableCell className="text-right tabular-nums">{formatMoney(Number(r.amount))}</TableCell>
          <TableCell className="text-right">
            <RowActions>
              <RowActionTooltipButton icon={EyeIcon} label="View payment" onClick={() => setViewing(r)} />
              {(inStatuses(UNPAID, r.status)) && (
                <RowActionTooltipButton icon={MailIcon} label="Email payment reminder" onClick={() => remind(r)} />
              )}
            </RowActions>
          </TableCell>
        </>
      )}
    />
      <ListPagination page={page} size={size} total={total} />
      <PaymentDetailDialog payment={viewing} onOpenChange={(o) => !o && setViewing(null)} />
    </div>
  );
}

export function PaymentsTableSkeleton({ scope = "all" }: { scope?: Scope }) {
  return <DataTable.Skeleton columns={columnsFor(scope)} hasId />;
}
