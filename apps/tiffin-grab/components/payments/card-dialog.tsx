"use client";

import { useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { ResponsiveDialog } from "@foundry/design-system";
import { Button, Notice, Reason, Skeleton } from "@/components/customer/kit";
import type { CardCheckoutContext } from "@/lib/payments/card-checkout-context";
import type { CardSource } from "@/lib/services/payment-stripe";
import type { PayOutcome } from "./pay-panel";
import { TrustLine } from "./trust-line";

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function SurchargeConfirm({ surcharge, newTotal, busy, onConfirm, onCancel }: {
  surcharge: string; newTotal: string; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Notice>Credit cards carry a ${surcharge} card fee. New total ${newTotal}. Debit cards have no fee.</Notice>
      <Button variant="hero" size="lg" className="w-full" pending={busy} onClick={onConfirm}>Pay ${newTotal}</Button>
      <Button variant="quiet" className="w-full" onClick={onCancel}>Use a different card</Button>
    </div>
  );
}

export function CardDialog({ open, onOpenChange, ctx, amountCents, pay }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: CardCheckoutContext;
  amountCents: number;
  pay: (source: CardSource, acceptSurcharge: boolean) => Promise<PayOutcome>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fee, setFee] = useState<{ surcharge: string; newTotal: string; tokenId: string } | null>(null);

  function close(next: boolean) {
    if (busy) return;
    if (!next) {
      setError(null);
      setFee(null);
    }
    onOpenChange(next);
  }

  async function run(accept: boolean) {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    try {
      let tokenId = fee?.tokenId;
      if (!tokenId) {
        const { error: submitError } = await elements.submit();
        if (submitError) return setError(submitError.message ?? "Check your card details");
        const { error: tokErr, confirmationToken } = await stripe.createConfirmationToken({ elements });
        if (tokErr || !confirmationToken) return setError(tokErr?.message ?? "Could not read your card");
        tokenId = confirmationToken.id;
      }
      const r = await pay({ confirmationTokenId: tokenId }, accept);
      if (r.kind === "done") return close(false);
      if (r.kind === "confirm_surcharge") return setFee({ surcharge: r.surcharge, newTotal: r.newTotal, tokenId });
      setFee(null);
      setError(r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      direction="bottom"
      title="Pay with a new card"
      description="Your card is entered securely with Stripe."
      footer={
        fee ? null : (
          <Button variant="hero" size="lg" pending={busy} disabled={!stripe || !ready} onClick={() => run(false)}>
            Pay {dollars(amountCents)}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <div className={fee ? "hidden" : "flex flex-col gap-4"}>
          {!ready && <Skeleton className="h-40 w-full" />}
          <PaymentElement
            onReady={() => setReady(true)}
            options={{
              layout: "tabs",
              wallets: { applePay: "never", googlePay: "never" },
              defaultValues: { billingDetails: { email: ctx.prefill.email, name: ctx.prefill.name, phone: ctx.prefill.phone ?? undefined } },
            }}
          />
          <Reason>This card is saved for faster payments next time.</Reason>
          {ctx.feeNote && <Reason>{ctx.feeNote}. Debit cards have no fee.</Reason>}
        </div>
        {fee && (
          <SurchargeConfirm
            surcharge={fee.surcharge}
            newTotal={fee.newTotal}
            busy={busy}
            onConfirm={() => run(true)}
            onCancel={() => setFee(null)}
          />
        )}
        {error && (
          <Notice tone="error">
            <span className="flex flex-col gap-2">
              {error}
              {!fee && <Button variant="quiet" onClick={() => run(false)}>Retry</Button>}
            </span>
          </Notice>
        )}
        <TrustLine />
      </div>
    </ResponsiveDialog>
  );
}
