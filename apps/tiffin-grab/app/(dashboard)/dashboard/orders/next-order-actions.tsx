"use client";
import { useState, useTransition } from "react";
import { CheckCheckIcon, MailIcon, MessageSquarePlusIcon, PhoneIcon } from "lucide-react";
import { toast } from "sonner";
import { formatPhone } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Textarea } from "@foundry/ui/textarea";
import { whatsappHref } from "@/components/dashboard/next-item/contact-chips";
import { RecommendationActions, type IconAction } from "@/components/dashboard/next-item/recommendation-actions";
import { useCardRefresh } from "@/components/dashboard/next-item/recommendation-card";
import type { NextOrderRow } from "@/lib/orders/next-order.service";
import { addOrderNoteAction } from "./actions";
import { emailPaymentLinkAction } from "../_order/actions";
import { cancel } from "./[id]/actions";
import { verifyPaymentAction } from "@/app/(dashboard)/dashboard/payments/actions";
import { CancelOrderDialog } from "./cancel-order-dialog";

type Target = Pick<NextOrderRow, "publicId" | "reason" | "paymentPublicId" | "status" | "phone"> & { name: string };

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

/** The payment action the row offers; missed and flagged orders have none. */
function paymentAction(row: Target): "verify" | "send" | null {
  if (!row.paymentPublicId) return null;
  if (row.reason === "verify") return "verify";
  return row.reason === "overdue" || row.reason === "pending" ? "send" : null;
}

/** The payment action, Call and Note beside the name (two at most); WhatsApp, Open order and Cancel order under More actions. */
export function NextOrderActions({ row }: { row: Target }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const { pending, run } = useResult();
  const pay = row.paymentPublicId;
  const action = paymentAction(row);
  const cancellable = row.status !== "cancelled" && row.status !== "completed";
  const wa = whatsappHref({ phone: row.phone });
  const payIcon: IconAction | null = !pay
    ? null
    : action === "verify"
      ? { key: "pay", icon: CheckCheckIcon, label: "Verify payment", pending, onClick: () => run(() => verifyPaymentAction(row.publicId, pay), "Payment verified") }
      : action === "send"
        ? { key: "pay", icon: MailIcon, label: "Send payment link", pending, onClick: () => run(() => emailPaymentLinkAction(row.publicId, pay), "Payment link sent") }
        : null;
  const callIcon: IconAction | null = row.phone
    ? { key: "call", icon: PhoneIcon, label: `Call ${row.name}, ${formatPhone(row.phone)}`, href: `tel:${row.phone}` }
    : null;
  const noteIcon: IconAction = { key: "note", icon: MessageSquarePlusIcon, label: "Note", tone: "text-violet-600 dark:text-violet-400", onClick: () => setNoteOpen(true) };
  const primary = [payIcon, callIcon, noteIcon].filter((a): a is IconAction => a !== null).slice(0, 2);
  return (
    <>
      <RecommendationActions
        primary={primary}
        more={[
          ...(primary.includes(noteIcon) ? [] : [{ key: "note", label: "Note", onSelect: () => setNoteOpen(true) }]),
          ...(wa ? [{ key: "whatsapp", label: "WhatsApp", ariaLabel: `WhatsApp ${row.name}, ${formatPhone(row.phone)}`, href: wa }] : []),
          { key: "open", label: "Open order", href: `/dashboard/orders/${row.publicId}` },
          ...(cancellable ? [{ key: "cancel", label: "Cancel order", destructive: true, onSelect: () => setCancelOpen(true) }] : []),
        ]}
      />
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
