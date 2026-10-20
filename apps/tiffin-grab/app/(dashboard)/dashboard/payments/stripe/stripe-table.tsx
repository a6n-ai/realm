"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCardIcon, RefreshCwIcon, ScaleIcon, Undo2Icon } from "lucide-react";
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
import { checkStatusAction, refundAction } from "./actions";
import { ReconcileDialog } from "./reconcile-dialog";

const SPEC: FacetDef[] = [
  { kind: "pills", field: "status", label: "Status", options: [...PAYMENT_STATUS_OPTIONS] },
  { kind: "multi", field: "attention", label: "Needs attention", options: [...STRIPE_FACETS] },
  { kind: "dateRange", field: "createdAt", label: "Submitted" },
  { kind: "search", fields: [] },
];

type Key = PaymentSortKey | "for" | "card" | "surcharge" | "tax" | "stripe" | "actions";
const COLUMNS: readonly Column<Key>[] = [
  { key: "time", label: "Submitted", sortable: true, width: "w-44" },
  { key: "customer", label: "Customer", sortable: true },
  { key: "order", label: "Order", sortable: true },
  { key: "for", label: "For", width: "w-40" },
  { key: "card", label: "Card", width: "w-28" },
  { key: "surcharge", label: "Surcharge", align: "right", width: "w-24" },
  { key: "tax", label: "Tax", width: "w-24" },
  { key: "stripe", label: "Stripe", width: "w-36" },
  { key: "status", label: "Status", sortable: true, width: "w-40" },
  { key: "amount", label: "Amount", sortable: true, align: "right", width: "w-24" },
  { key: "actions", label: "Actions", align: "right", width: "w-24" },
];

function ExpiryBadge({ r, now, tz }: { r: PaymentRow; now: number; tz: string }) {
  if (r.isAddon && r.expiresAt === 0) {
    // A void link a late webhook still charged: the money is in, the add-ons are not applied.
    if (r.status === "paid") return <Badge variant="destructive-light">Refund needed</Badge>;
    return r.status === "awaiting_payment" ? <Badge variant="outline">Void</Badge> : null;
  }
  if (r.status !== "awaiting_payment" || r.expiresAt == null) return null;
  if (r.expiresAt === 0) return <Badge variant="outline">Void</Badge>;
  if (r.expiresAt <= now) return <Badge variant="warning-light">Expired</Badge>;
  return <Badge variant="info-light">Expires {formatEpoch(r.expiresAt, { mode: "datetime", timeZone: tz })}</Badge>;
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
  const [reconciling, setReconciling] = useState(false);
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
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setReconciling(true)}>
          <ScaleIcon data-icon="inline-start" /> Reconcile with Stripe
        </Button>
      </div>
      <DataTable
        serialOffset={page * size}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        idAccessor={(r) => r.publicId}
        idHref={(r) => `/dashboard/orders/${r.orderPublicId}`}
        rowClassName={() => "group/row"}
        sort={sort as SortState<Key>}
        filters={<ListSearchFilters spec={SPEC} placeholder="Search order, customer, reference…" shortPlaceholder="Search…" />}
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
              <Link href={`/dashboard/orders/${r.orderPublicId}`} className="block truncate hover:underline">{r.orderPublicId}</Link>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-sm">{r.isAddon ? "Add-ons" : "Order"}</span>
                <ExpiryBadge r={r} now={now} tz={tz} />
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap text-xs">
              {r.cardLast4 ? `${r.cardBrand ?? "card"} ••${r.cardLast4}` : "-"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {Number(r.surchargeAmount) > 0 ? formatMoney(Number(r.surchargeAmount)) : "-"}
            </TableCell>
            <TableCell>
              {r.taxSource ? (
                <Badge variant={r.taxSource === "fallback" ? "outline" : "secondary"} className="text-[0.65rem]">{r.taxSource}</Badge>
              ) : (
                "-"
              )}
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
            <TableCell><PaymentStatusPill status={r.status} /></TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(Number(r.amount))}</TableCell>
            <TableCell className="text-right">
              <RowActions>
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

      <ReconcileDialog open={reconciling} onOpenChange={setReconciling} />
    </div>
  );
}

export function StripeTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
