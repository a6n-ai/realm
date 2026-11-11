"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheckIcon, MailIcon, MessageSquarePlusIcon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Textarea } from "@foundry/ui/textarea";
import { RowActionTooltipButton } from "@/components/ds";
import { NextItemOpenButton } from "@/components/dashboard/next-item/open-button";
import type { NextOrderRow } from "@/lib/services/next-order.service";
import { addOrderNoteAction, emailPaymentLinkAction } from "./actions";
import { cancel, verifyPaymentAction } from "./[id]/actions";
import { CancelOrderDialog } from "./cancel-order-dialog";

type Target = Pick<NextOrderRow, "publicId" | "reason" | "paymentPublicId" | "status">;

function useResult() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error: string } | { ok: true }>, done: string, onOk?: () => void) =>
    start(async () => {
      const res = await fn();
      if ("ok" in res) {
        toast.success(done);
        onOk?.();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  return { pending, run };
}

/** The card's one labelled primary: Verify payment when the reason is verify, else Send payment link, else Add note. */
export function NextOrderPrimary({ row }: { row: Target }) {
  const { pending, run } = useResult();
  const [noteOpen, setNoteOpen] = useState(false);
  const pay = row.paymentPublicId;
  if (row.reason === "verify" && pay) {
    return (
      <Button size="sm" disabled={pending} onClick={() => run(() => verifyPaymentAction(row.publicId, pay), "Payment verified")}>
        <CheckCheckIcon className="size-4" />
        Verify payment
      </Button>
    );
  }
  if (pay) {
    return (
      <Button size="sm" disabled={pending} onClick={() => run(() => emailPaymentLinkAction(row.publicId, pay), "Payment link sent")}>
        <MailIcon className="size-4" />
        Send payment link
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" onClick={() => setNoteOpen(true)}>
        <MessageSquarePlusIcon className="size-4" />
        Add note
      </Button>
      {noteOpen ? <AddNoteDialog orderPublicId={row.publicId} onDone={() => setNoteOpen(false)} /> : null}
    </>
  );
}

/** Icon-only secondary actions on the Next order card: Add note (when not the primary), Cancel order, Open. */
export function NextOrderIconActions({ row }: { row: Target }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const { pending, run } = useResult();
  const cancellable = row.status !== "cancelled" && row.status !== "completed";
  return (
    <>
      {row.paymentPublicId ? (
        <RowActionTooltipButton icon={MessageSquarePlusIcon} label="Add note" tone="text-violet-600 dark:text-violet-400" onClick={() => setNoteOpen(true)} />
      ) : null}
      <NextItemOpenButton href={`/dashboard/orders/${row.publicId}`} label="Open order" />
      {cancellable ? (
        <RowActionTooltipButton icon={XCircleIcon} label="Cancel order" tone="text-destructive" onClick={() => setCancelOpen(true)} />
      ) : null}
      {noteOpen ? <AddNoteDialog orderPublicId={row.publicId} onDone={() => setNoteOpen(false)} /> : null}
      <CancelOrderDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        pending={pending}
        onConfirm={() => run(() => cancelOrder(row.publicId), "Order cancelled", () => setCancelOpen(false))}
      />
    </>
  );
}

/** `cancel` throws on states it cannot cancel; the card shows that message as a toast instead. */
async function cancelOrder(orderId: string): Promise<{ ok: true } | { error: string }> {
  try {
    await cancel(orderId);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't cancel this order" };
  }
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
