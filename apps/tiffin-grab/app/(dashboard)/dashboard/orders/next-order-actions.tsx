"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRightIcon, CheckCheckIcon, MailIcon, MessageSquarePlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Textarea } from "@foundry/ui/textarea";
import { addOrderNoteAction, emailPaymentLinkAction } from "./actions";
import { verifyPaymentAction } from "./[id]/actions";
import type { NextOrderReason } from "@/lib/services/next-order.service";

type Target = { publicId: string; reason: NextOrderReason; paymentPublicId: string | null };

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

/** Verify payment, Send payment link, Add note, Open: only the ones this order's reason calls for. */
export function NextOrderActions({ row }: { row: Target }) {
  const { pending, run } = useResult();
  const [noteOpen, setNoteOpen] = useState(false);
  const pay = row.paymentPublicId;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {row.reason === "verify" && pay ? (
        <Button variant="default" size="sm" disabled={pending} onClick={() => run(() => verifyPaymentAction(row.publicId, pay), "Payment verified")}>
          <CheckCheckIcon className="size-4" />
          Verify payment
        </Button>
      ) : null}
      {(row.reason === "overdue" || row.reason === "pending") && pay ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => emailPaymentLinkAction(row.publicId, pay), "Payment link sent")}>
          <MailIcon className="size-4" />
          Send payment link
        </Button>
      ) : null}
      <Button variant="outline" size="sm" className="text-violet-600 dark:text-violet-400" onClick={() => setNoteOpen(true)}>
        <MessageSquarePlusIcon className="size-4" />
        Add note
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/dashboard/orders/${row.publicId}`}>
          <ArrowUpRightIcon className="size-4" />
          Open
        </Link>
      </Button>
      {noteOpen ? <AddNoteDialog orderPublicId={row.publicId} onDone={() => setNoteOpen(false)} /> : null}
    </div>
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
