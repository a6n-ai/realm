"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatMoney } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { verifyPaymentAction } from "../orders/[id]/actions";
import type { TodayPayment } from "@/lib/today/types";

export function VerifyPaymentButton({ who, payment }: { who: string; payment: TodayPayment }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function verify() {
    start(async () => {
      try {
        const res = await verifyPaymentAction(payment.orderId, payment.paymentId);
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        toast.success("Payment verified");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not verify payment");
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Verify
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify this payment?</DialogTitle>
            <DialogDescription>Check the amount and reference against the bank before confirming.</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Customer</dt>
            <dd className="text-right font-medium">{who}</dd>
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="text-right font-medium tabular-nums">{formatMoney(Number(payment.amount))}</dd>
            <dt className="text-muted-foreground">Method</dt>
            <dd className="text-right font-medium">{payment.method}</dd>
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="text-right font-medium break-all">{payment.reference || "None given"}</dd>
            <dt className="text-muted-foreground">Proof</dt>
            <dd className="text-right font-medium">
              {payment.proofUrl ? (
                <a href={payment.proofUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Open proof
                </a>
              ) : (
                "None uploaded"
              )}
            </dd>
          </dl>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={verify}>
              {pending ? "Verifying…" : "Verify payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
