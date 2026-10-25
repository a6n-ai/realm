"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
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
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { SortState } from "@/lib/list/sort";
import { PAYMENT_STATUS_OPTIONS, STRIPE_FACETS, type PaymentRow, type PaymentSortKey } from "../payment-facets";
import { PaymentStatusPill } from "../payment-status-pill";
import { PaymentDetailDialog } from "../payment-detail-dialog";
import { sendPaymentReminderAction } from "../../orders/[id]/actions";
import { sendTone } from "../../customers/customer-invite-cell";
import { checkStatusAction, refundAction } from "./actions";

const SPEC: FacetDef[] = [
  { kind: "pills", field: "status", label: "Status", options: [...PAYMENT_STATUS_OPTIONS] },
  { kind: "multi", field: "attention", label: "Needs attention", options: [...STRIPE_FACETS] },
  { kind: "dateRange", field: "createdAt", label: "Submitted" },
  { kind: "search", fields: [] },
];

// Same frame as the e-transfer table; surcharge, tax source and expiry time live in the detail dialog and tooltips.
type Key = PaymentSortKey | "card" | "stripe" | "actions";
const COLUMNS: readonly Column<Key>[] = [
  { key: "time", label: "Submitted", sortable: true, width: "w-44" },
  { key: "customer", label: "Customer", sortable: true },
  { key: "order", label: "Order", sortable: true },
  { key: "card", label: "Card", width: "w-32" },
  { key: "stripe", label: "Stripe", width: "w-36" },
  { key: "status", label: "Status", sortable: true, width: "w-48" },
  { key: "amount", label: "Amount", sortable: true, align: "right", width: "w-24" },
  { key: "actions", label: "Actions", align: "right", width: "w-28" },
];

export function ExpiryBadge({ r, now, tz }: { r: Pick<PaymentRow, "isAddon" | "expiresAt" | "status">; now: number; tz: string }) {
  // expiresAt 0 is a void link (voidLink writes status rejected).
  if (r.expiresAt === 0) {
    // A void link a late webhook still charged: the money is in, the add-ons are not applied.
    if (r.isAddon && r.status === "paid") return <Badge variant="destructive-light">Refund needed</Badge>;
    return r.status === "rejected" ? <Badge variant="outline">Void</Badge> : null;
  }
  if (r.status !== "awaiting_payment" || r.expiresAt == null) return null;
  if (r.expiresAt <= now) return <Badge variant="warning-light">Expired</Badge>;
  return (
    <Badge variant="info-light" title={`Expires ${formatEpoch(r.expiresAt, { mode: "datetime", timeZone: tz })}`}>
      Link open
    </Badge>
  );
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
        serialOffset={page * size}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        idAccessor={(r) => r.publicId}
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
            <TableCell className="text-muted-foreground truncate" title={r.email ?? undefined}>{r.email ?? "-"}</TableCell>
            <TableCell>
              <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                <Link href={`/dashboard/orders/${r.orderPublicId}`} className="truncate hover:underline">
                  {r.orderPublicId}
                </Link>
                {r.isAddon && <span className="text-xs text-muted-foreground">Add-ons</span>}
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap text-xs">
              {r.cardLast4 ? `${r.cardBrand ?? "card"} ••${r.cardLast4}` : "-"}
            </TableCell>
            <TableCell className="font-mono text-xs">
              {r.providerRef ? (
                <a
                  href={`https://dashboard.stripe.com/${livemode ? "" : "test/"}payments/${r.providerRef}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate hover:underline"
                  title={r.providerRef}
                 
                >
                  {r.providerRef}
                </a>
              ) : (
                "-"
              )}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1 whitespace-nowrap">
                <PaymentStatusPill status={r.status} />
                <ExpiryBadge r={r} now={now} tz={tz} />
              </div>
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
                {(r.status === "awaiting_payment" || r.status === "rejected") && (() => {
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
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
