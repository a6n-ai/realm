"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScaleIcon } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import type { ReconcileRow, SettleEffect } from "@/lib/services/payment-stripe";
import { reconcileAction, settleFromReconcileAction } from "./actions";

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

const LABEL: Record<ReconcileRow["kind"], string> = {
  unpaid_here: "Paid in Stripe, unpaid here",
  amount_differs: "Amount differs",
  paid_here_not_in_stripe: "Paid here, not in Stripe",
  unmatched_charge: "Charge with no order",
};

const SETTLE_LABEL: Record<SettleEffect, string> = {
  start: "Settle and start order",
  addons: "Settle and add add-ons",
  plain: "Settle",
};

function detail(r: ReconcileRow): string {
  switch (r.kind) {
    case "unpaid_here": return `${r.paymentRef} · ${r.piId} · ${formatMoney(Number(r.amount))}`;
    case "amount_differs": return `${r.paymentRef} · ${r.piId} · Stripe ${formatMoney(Number(r.stripe))} vs here ${formatMoney(Number(r.ours))}`;
    case "paid_here_not_in_stripe": return `${r.paymentRef} · ${r.piId ?? "no PI"} · ${formatMoney(Number(r.amount))}`;
    case "unmatched_charge": return `${r.piId} · ${formatMoney(Number(r.amount))}`;
  }
}

export function ReconcileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState(() => iso(Date.now() - 7 * DAY));
  const [to, setTo] = useState(() => iso(Date.now()));
  const [rows, setRows] = useState<ReconcileRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  function run(next?: string) {
    start(async () => {
      // `to` is inclusive of the whole day.
      const res = await reconcileAction(new Date(`${from}T00:00:00`).getTime(), new Date(`${to}T23:59:59.999`).getTime(), next);
      if ("error" in res) return void toast.error(res.error);
      setRows(next ? [...(rows ?? []), ...res.rows] : res.rows);
      setCursor(res.nextCursor);
      if (!next) setTruncated(res.truncated);
    });
  }

  function settle(ref: string) {
    start(async () => {
      const res = await settleFromReconcileAction(ref);
      if ("error" in res) return void toast.error(res.error);
      (res.settled ? toast.success : toast.warning)(res.message);
      if (res.settled) setRows((rs) => rs?.filter((r) => !("paymentRef" in r && r.paymentRef === ref)) ?? null);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reconcile with Stripe</DialogTitle>
          <DialogDescription>Compares succeeded charges in Stripe with card payments here. Nothing changes until you press Settle.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-2">
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="From" />
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="To" />
          <Button disabled={pending || !from || !to} onClick={() => run()}>Run</Button>
        </div>
        {rows && (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {rows.length === 0 && <p className="text-sm text-muted-foreground">Everything in this range matches.</p>}
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{LABEL[r.kind]}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{detail(r)}</p>
                </div>
                {r.kind === "unpaid_here" && (
                  <Button size="sm" disabled={pending} onClick={() => settle(r.paymentRef)}>{SETTLE_LABEL[r.effect]}</Button>
                )}
              </div>
            ))}
            {truncated && (
              <p className="text-xs text-muted-foreground">Checked the first 50 paid payments. Narrow the date range to check more.</p>
            )}
            {cursor && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">More than one page of Stripe charges. Narrow the date range for a complete check, or load the next page.</p>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(cursor)}>Next page</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ReconcileButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ScaleIcon data-icon="inline-start" /> Reconcile with Stripe
      </Button>
      <ReconcileDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
