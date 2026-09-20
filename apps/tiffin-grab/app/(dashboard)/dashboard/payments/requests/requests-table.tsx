"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, InboxIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import { Textarea } from "@foundry/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { DataTable, type Column } from "@/components/ds";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import { rejectPaymentAction, verifyPaymentAction } from "../../orders/[id]/actions";
import type { PaymentRow, PaymentSortKey } from "../payment-facets";
import type { SortState } from "@/lib/list/sort";

// reference/proof/actions have no sort key in PAYMENT_SORT_KEYS, so they stay plain headers.
const COLUMNS: readonly Column<PaymentSortKey | "reference" | "proof" | "actions">[] = [
  { key: "time", label: "Submitted", sortable: true },
  { key: "customer", label: "Customer", sortable: true },
  { key: "order", label: "Order", sortable: true },
  { key: "reference", label: "Reference" },
  { key: "proof", label: "Proof" },
  { key: "amount", label: "Amount", sortable: true, align: "right" },
  { key: "actions", label: "", align: "right" },
];

export function RequestsTable({ rows, sort }: { rows: PaymentRow[]; sort: SortState<PaymentSortKey> }) {
  const tz = useTimezone();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState<PaymentRow | null>(null);
  const [note, setNote] = useState("");

  function approve(r: PaymentRow) {
    start(async () => {
      const res = await verifyPaymentAction(r.orderPublicId, r.publicId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Approved ${formatMoney(Number(r.amount))} for ${r.orderPublicId}`);
      router.refresh();
    });
  }

  function reject() {
    if (!rejecting) return;
    if (!note.trim()) return toast.error("Add a reason so the customer knows what to fix");
    const target = rejecting;
    start(async () => {
      const res = await rejectPaymentAction(target.orderPublicId, target.publicId, note.trim());
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast("Request rejected");
      setRejecting(null);
      setNote("");
      router.refresh();
    });
  }

  return (
    <>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort as SortState<PaymentSortKey | "reference" | "proof" | "actions">}
        search={{ placeholder: "Search order, customer, reference…", shortPlaceholder: "Search…", debounceMs: 300 }}
        emptyIcon={InboxIcon}
        emptyMessage="Nothing waiting. New e-transfer claims land here for approval."
        renderRow={(r) => (
          <>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
              {formatEpoch(r.createdAt, { mode: "datetime", timeZone: tz })}
            </TableCell>
            <TableCell className="text-muted-foreground">{r.email ?? "-"}</TableCell>
            <TableCell>
              <Link href={`/dashboard/orders/${r.orderPublicId}`} className="hover:underline">
                {r.orderPublicId}
              </Link>
            </TableCell>
            <TableCell className="font-mono text-xs">{r.reference ?? "-"}</TableCell>
            <TableCell>
              {r.proofThumb ? (
                <a href={r.proofThumb} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.proofThumb} alt="Payment proof" className="size-10 rounded-md border object-cover" />
                </a>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(Number(r.amount))}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button size="sm" disabled={pending} onClick={() => approve(r)} className="gap-1.5">
                  <CheckIcon className="size-4" /> Approve
                </Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejecting(r)} className="gap-1.5">
                  <XIcon className="size-4" /> Reject
                </Button>
              </div>
            </TableCell>
          </>
        )}
      />

      <Dialog open={rejecting != null} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this e-transfer?</DialogTitle>
            <DialogDescription>
              The customer sees your reason and can resubmit. Nothing is credited.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Amount received was $40 short"
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={reject}>
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RequestsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
