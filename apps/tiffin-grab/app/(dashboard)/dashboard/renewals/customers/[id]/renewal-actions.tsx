"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BellRingIcon, CoinsIcon, MailIcon, MessageCircleIcon, PhoneIcon, XCircleIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { ResponsiveDialog } from "@/components/ds";
import type { ActionResult } from "@/app/(customer)/me/action-result";
import { cancel, sendPaymentReminderAction } from "../../../orders/[id]/actions";
import { broadcastCustomerPayout } from "../../../wallet/actions";
import { sendRenewalReminderAction } from "./actions";

/** Runs a server action, toasts the outcome, and refreshes the page so the timeline and reminders update. */
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult | void>, done = "Done") =>
    start(async () => {
      try {
        const res = await fn();
        if (res && "error" in res) return void toast.error(res.error);
        toast.success((res && res.message) || done);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  return { pending, run };
}

/** Call and WhatsApp buttons; WhatsApp opens with a renew message and the customer's renew link. */
export function ContactButtons({ name, phone, renewUrl }: { name: string; phone: string | null; renewUrl: string }) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const text = `Hi ${name.split(" ")[0] || "there"}, your TiffinGrab plan is ending soon. Renew here: ${renewUrl}`;
  return (
    <>
      <Button asChild size="sm" variant="outline">
        <a href={`tel:${phone}`}><PhoneIcon aria-hidden /> Call</a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><MessageCircleIcon aria-hidden /> WhatsApp</a>
      </Button>
    </>
  );
}

/** Emails the renewal reminder now; the server allows one per plan per day. */
export function SendReminderButton({ orderPublicId, customerPublicId }: { orderPublicId: string; customerPublicId: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => sendRenewalReminderAction(orderPublicId, customerPublicId), "Reminder sent")}>
      <BellRingIcon aria-hidden /> {pending ? "Sending…" : "Send reminder"}
    </Button>
  );
}

/** Admin only (same rule as Wallet → Give coins): add coins as a renewal sweetener. */
export function GiveCoinsButton({ customerPublicId }: { customerPublicId: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [coins, setCoins] = useState("");
  const [memo, setMemo] = useState("Renewal bonus");
  const n = Number(coins);
  const valid = Number.isInteger(n) && n > 0;
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button size="sm" variant="outline"><CoinsIcon aria-hidden /> Give coins</Button>}
      title="Give coins"
      description="Added to the customer's wallet now. They can spend them on the next plan."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button
            disabled={!valid || pending}
            onClick={() =>
              run(async () => {
                const r = await broadcastCustomerPayout({ userPublicIds: [customerPublicId], coins: n, memo: memo.trim() || undefined });
                setOpen(false);
                setCoins("");
                return { ok: true, message: r.capped > 0 ? `Gave ${r.coinsPerCustomer} coins (capped)` : `Gave ${r.coinsPerCustomer} coins` } as ActionResult;
              })
            }
          >
            Give coins
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="renewal-coins">Coins</Label>
          <Input id="renewal-coins" inputMode="numeric" value={coins} onChange={(e) => setCoins(e.target.value)} placeholder="e.g. 40" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="renewal-coins-memo">Note</Label>
          <Input id="renewal-coins-memo" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

/** On an unpaid or waitlisted next plan: email the payment link again, or cancel the plan. */
export function UnpaidPlanActions({ orderPublicId, paymentPublicId }: { orderPublicId: string; paymentPublicId: string | null }) {
  const { pending, run } = useRun();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {paymentPublicId && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => sendPaymentReminderAction(orderPublicId, paymentPublicId), "Payment reminder sent")}>
          <MailIcon aria-hidden /> Send payment reminder
        </Button>
      )}
      <ResponsiveDialog
        open={confirm}
        onOpenChange={setConfirm}
        trigger={<Button size="sm" variant="ghost" disabled={pending}><XCircleIcon aria-hidden /> Cancel plan</Button>}
        title="Cancel this plan?"
        description="Cancels the unpaid plan, its open payment, and its scheduled deliveries. This cannot be undone."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)}>Keep plan</Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setConfirm(false);
                run(() => cancel(orderPublicId), "Plan cancelled");
              }}
            >
              Cancel plan
            </Button>
          </div>
        }
      >
        <div />
      </ResponsiveDialog>
    </div>
  );
}
