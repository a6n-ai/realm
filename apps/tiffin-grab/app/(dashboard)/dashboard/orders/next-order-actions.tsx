"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRightIcon, CheckCheckIcon, MailIcon, MessageSquarePlusIcon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Textarea } from "@foundry/ui/textarea";
import { RowActionTooltipButton } from "@/components/ds";
import { NextItemOpenButton } from "@/components/dashboard/next-item/open-button";
import { useCardRefresh } from "@/components/dashboard/next-item/recommendation-card";
import type { NextOrderRow } from "@/lib/services/next-order.service";
import { addOrderNoteAction } from "./actions";
import { emailPaymentLinkAction } from "../_order/actions";
import { cancel, verifyPaymentAction } from "./[id]/actions";
import { CancelOrderDialog } from "./cancel-order-dialog";

type Target = Pick<NextOrderRow, "publicId" | "reason" | "paymentPublicId" | "status">;

function useResult() {
  const { refresh } = useCardRefresh();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error: string } | { ok: true }>, done: string, onOk?: () => void) =>
    start(async () => {
      const res = await fn();
      if ("ok" in res) {
        toast.success(done);
        onOk?.();
        refresh();
      } else {
        toast.error(res.error);
      }
    });
  return { pending, run };
}

/** The payment action the card's primary takes; missed and flagged orders get Open order instead. */
function paymentAction(row: Target): "verify" | "send" | null {
  if (!row.paymentPublicId) return null;
  if (row.reason === "verify") return "verify";
  return row.reason === "overdue" || row.reason === "pending" ? "send" : null;
}

/** The card's one labelled primary: Verify payment or Send payment link when a payment is open, else Open order. */
export function NextOrderPrimary({ row }: { row: Target }) {
  const { pending, run } = useResult();
  const pay = row.paymentPublicId;
  const action = paymentAction(row);
  if (pay && action === "verify") {
    return (
      <Button size="sm" disabled={pending} onClick={() => run(() => verifyPaymentAction(row.publicId, pay), "Payment verified")}>
        <CheckCheckIcon className="size-4" />
        Verify payment
      </Button>
    );
  }
  if (pay && action === "send") {
    return (
      <Button size="sm" disabled={pending} onClick={() => run(() => emailPaymentLinkAction(row.publicId, pay), "Payment link sent")}>
        <MailIcon className="size-4" />
        Send payment link
      </Button>
    );
  }
  return (
    <Button size="sm" asChild>
      <Link href={`/dashboard/orders/${row.publicId}`} prefetch={false}>
        <ArrowUpRightIcon className="size-4" />
        Open order
      </Link>
    </Button>
  );
}

/** Icon-only secondary actions on the Next order card: Add note, Cancel order, and Open order when the primary is a payment action. */
export function NextOrderIconActions({ row }: { row: Target }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const { pending, run } = useResult();
  const cancellable = row.status !== "cancelled" && row.status !== "completed";
  return (
    <>
      <RowActionTooltipButton icon={MessageSquarePlusIcon} label="Add note" tone="text-violet-600 dark:text-violet-400" onClick={() => setNoteOpen(true)} />
      {paymentAction(row) ? <NextItemOpenButton href={`/dashboard/orders/${row.publicId}`} label="Open order" /> : null}
      {cancellable ? (
        <RowActionTooltipButton icon={XCircleIcon} label="Cancel order" tone="text-destructive" onClick={() => setCancelOpen(true)} />
      ) : null}
      {noteOpen ? <AddNoteDialog orderPublicId={row.publicId} onDone={() => setNoteOpen(false)} /> : null}
      <CancelOrderDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        pending={pending}
        onConfirm={() => run(() => cancel(row.publicId), "Order cancelled", () => setCancelOpen(false))}
      />
    </>
  );
}

function AddNoteDialog({ orderPublicId, onDone }: { orderPublicId: string; onDone: () => void }) {
  const { pending, run } = useResult();
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add note</DialogTitle>
          <DialogDescription>Written to the order&apos;s activity log under your name.</DialogDescription>
        </DialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={4} aria-label="Note" />
        <DialogFooter>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          <Button
            disabled={pending || note.trim().length === 0}
            onClick={() => run(() => addOrderNoteAction(orderPublicId, note), "Note added", onDone)}
          >
            Save note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
