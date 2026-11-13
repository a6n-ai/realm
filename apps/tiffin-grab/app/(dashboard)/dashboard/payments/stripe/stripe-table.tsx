"use client";

import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { inStatuses, UNPAID } from "@/lib/payments/status";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CreditCardIcon, EyeIcon, MailIcon, RefreshCwIcon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@foundry/commons";
import { Badge } from "@/components/reui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Textarea } from "@foundry/ui/textarea";
import { TableCell } from "@foundry/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { DataTable, ListPagination, RowActions, RowActionTooltipButton, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/reui-facet-filters";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import type { SortState } from "@foundry/design-system/list-sort";
import { PAYMENT_STATUS_OPTIONS, STRIPE_FACETS, type PaymentRow, type PaymentSortKey } from "@/lib/payments/facets";
import { PaymentStatusPill } from "../payment-status-pill";
import { CustomerLink } from "../customer-link";
import { PaymentDetailDialog } from "../payment-detail-dialog";
import { sendPaymentReminderAction } from "@/app/(dashboard)/dashboard/payments/actions";
import { sendTone } from "@/lib/notifications/send-tone";
import { checkStatusAction, refundAction } from "./actions";

const SPEC: FacetDef[] = [
  { kind: "pills", field: "status", label: "Status", options: [...PAYMENT_STATUS_OPTIONS] },
  { kind: "multi", field: "attention", label: "Needs attention", options: [...STRIPE_FACETS] },
  { kind: "dateRange", field: "createdAt", label: "Submitted" },
  { kind: "search", fields: [] },
];

// Sized to fit the card at 1400px without side-scroll: the payment ID, surcharge, tax source and
// expiry time live in the detail dialog (row click) and tooltips.
type Key = PaymentSortKey | "card" | "actions";
const COLUMNS: readonly Column<Key>[] = [
  { key: "time", label: "Submitted", sortable: true, width: "w-44" },
  { key: "customer", label: "Customer", sortable: true, width: "w-48" },
  { key: "card", label: "Card", width: "w-28" },
  { key: "status", label: "Status", sortable: true, width: "w-36" },
  { key: "amount", label: "Amount", sortable: true, align: "right", width: "w-24" },
  { key: "actions", label: "Actions", align: "right", width: "w-28" },
];

/** Pay-link state that says more than the status pill (Void, Refund needed, Expired); otherwise `fallback`. */
export function ExpiryBadge({
  r, now, tz, fallback = null,
}: {
  r: Pick<PaymentRow, "isAddon" | "expiresAt" | "status">;
  now: number;
  tz: string;
  fallback?: ReactNode;
}) {
  // expiresAt 0 is a void link (voidLink writes status rejected).
  if (r.expiresAt === 0) {
    // A void link a late webhook still charged: the money is in, the add-ons are not applied.
    if (r.isAddon && r.status === "paid") return <Badge variant="destructive-light">Refund needed</Badge>;
    return r.status === "rejected" ? <Badge variant="outline">Void</Badge> : fallback;
  }
  if (r.status === "awaiting_payment" && r.expiresAt != null && r.expiresAt <= now) {
    return (
      <Badge variant="warning-light" title={`Expired ${formatEpoch(r.expiresAt, { mode: "datetime", timeZone: tz })}`}>
        Expired
      </Badge>
    );
  }
  return fallback;
}

export function StripeTable({
  rows, total, page, size, sort, livemode, canRefund, now,
}: {
  rows: PaymentRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<PaymentSortKey>;
  livemode: boolean;
  canRefund: boolean;
  now: number;
}) {
  const tz = useTimezone();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [refunding, setRefunding] = useState<PaymentRow | null>(null);
  const [viewing, setViewing] = useState<PaymentRow | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  function check(r: PaymentRow) {
    start(async () => {
      const res = await checkStatusAction(r.publicId);
      if ("error" in res) return void toast.error(res.error);
      (res.settled ? toast.success : toast)(res.message);
      router.refresh();
    });
  }

  function remind(r: PaymentRow) {
    start(async () => {
      const res = await sendPaymentReminderAction(r.orderPublicId, r.publicId);
      if ("error" in res) return void toast.error(res.error);
      toast.success("Payment reminder emailed", { description: `Sent to ${r.email ?? "the customer"}.` });
      router.refresh();
    });
  }

  function refund() {
    if (!refunding) return;
    const target = refunding;
    start(async () => {
      const res = await refundAction(target.publicId, amount, reason);
      if ("error" in res) return void toast.error(res.error);
      toast.success(res.message ?? "Refund requested");
      setRefunding(null);
      setAmount("");
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <DataTable
        serialOffset={pageOffset(page, size)}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        onRowClick={setViewing}
        rowClassName={() => "group/row"}
        sort={sort as SortState<Key>}
        filters={<ListSearchFilters spec={SPEC} placeholder="Search order, customer, reference…" shortPlaceholder="Search…" dateControl="external" />}
        emptyIcon={CreditCardIcon}
        emptyMessage="No card payments yet."
        emptySearchMessage="No card payments match your filters."
        renderRow={(r) => (
          <>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
              {formatEpoch(r.createdAt, { mode: "datetime", timeZone: tz })}
            </TableCell>
            <TableCell className="text-muted-foreground">
              <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                <CustomerLink row={r} />
                {r.isAddon && <span className="text-xs">Add-ons</span>}
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap text-xs">
              {(() => {
                const card = r.cardLast4 ? `${r.cardBrand ?? "card"} ••${r.cardLast4}` : r.providerRef ? "Stripe" : "-";
                return r.providerRef ? (
                  <a
                    href={`https://dashboard.stripe.com/${livemode ? "" : "test/"}payments/${r.providerRef}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                    title={`Open ${r.providerRef} in Stripe`}
                  >
                    {card}
                  </a>
                ) : (
                  card
                );
              })()}
            </TableCell>
            <TableCell>
              <ExpiryBadge r={r} now={now} tz={tz} fallback={<PaymentStatusPill status={r.status} />} />
            </TableCell>
            <TableCell
              className="whitespace-nowrap text-right tabular-nums"
              title={Number(r.surchargeAmount) > 0 ? `Includes ${formatMoney(Number(r.surchargeAmount))} card surcharge` : undefined}
            >
              {formatMoney(Number(r.amount))}
            </TableCell>
            <TableCell className="text-right">
              <RowActions>
                <RowActionTooltipButton icon={EyeIcon} label="View payment" onClick={() => setViewing(r)} />
                {(inStatuses(UNPAID, r.status)) && (() => {
                  const { tone, status } = sendTone(r.lastReminder, (ms) => formatEpoch(ms, { mode: "datetime", timeZone: tz }));
                  return (
                    <RowActionTooltipButton
                      icon={MailIcon}
                      label="Send payment reminder"
                      hint={`Send payment reminder · ${status}`}
                      tone={tone}
                      disabled={pending || !r.email}
                      onClick={() => remind(r)}
                    />
                  );
                })()}
                {r.providerRef && r.status !== "paid" && r.status !== "refunded" && (
                  <RowActionTooltipButton icon={RefreshCwIcon} label="Check status" disabled={pending} onClick={() => check(r)} />
                )}
                {canRefund && r.status === "paid" && (
                  <RowActionTooltipButton icon={Undo2Icon} label="Refund" disabled={pending} onClick={() => setRefunding(r)} />
                )}
              </RowActions>
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />

      <Dialog open={refunding != null} onOpenChange={(o) => !o && setRefunding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund card payment</DialogTitle>
            <DialogDescription>
              Sent to Stripe. The ledger and payment status update when Stripe confirms. Leave the amount blank to refund
              the full remaining balance (including surcharge).
            </DialogDescription>
          </DialogHeader>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Amount (blank = full remaining)" />
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (kept in the order activity log)" rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRefunding(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={refund}>Refund</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentDetailDialog payment={viewing} onOpenChange={(o) => !o && setViewing(null)} />
    </div>
  );
}

export function StripeTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
