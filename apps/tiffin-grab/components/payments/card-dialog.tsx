"use client";

import { useRef, useState, type ReactNode } from "react";
import { AlertCircle, Info, Loader2 } from "lucide-react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { ResponsiveDialog } from "@foundry/design-system";
import { Alert, AlertAction, AlertDescription } from "@/components/reui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import type { CardCheckoutContext } from "@/lib/payments/card-checkout-context";
import type { CardSource } from "@/lib/services/payment-stripe";
import type { PayOutcome } from "./pay-panel";
import { TrustLine } from "./trust-line";

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function Spinner({ show }: { show: boolean }) {
  return show ? <Loader2 aria-hidden className="animate-spin" /> : null;
}

export function ErrorAlert({ message, busy, onRetry }: { message: string; busy: boolean; onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden />
      <AlertDescription>{message}</AlertDescription>
      {onRetry && (
        <AlertAction>
          <Button variant="outline" size="sm" disabled={busy} onClick={onRetry}>
            <Spinner show={busy} />
            Retry
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}

export function SurchargeConfirm({ surcharge, newTotal, busy, onConfirm, onCancel }: {
  surcharge: string; newTotal: string; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Alert variant="info">
        <Info aria-hidden />
        <AlertDescription>Credit cards carry a ${surcharge} card fee. New total ${newTotal}. Debit cards have no fee.</AlertDescription>
      </Alert>
      <Button size="lg" className="w-full" disabled={busy} onClick={onConfirm}>
        <Spinner show={busy} />
        Pay ${newTotal}
      </Button>
      <Button variant="outline" className="w-full" onClick={onCancel}>Use a different card</Button>
    </div>
  );
}

export function CardDialog({ open, onOpenChange, ctx, amountCents, pay, printer }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: CardCheckoutContext;
  amountCents: number;
  pay: (source: CardSource, acceptSurcharge: boolean) => Promise<PayOutcome>;
  /** The receipt printer once the charge settled: the dialog shrinks to it instead of closing. */
  printer: ReactNode;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [fee, setFee] = useState<{ surcharge: string; newTotal: string; tokenId: string } | null>(null);

  function close(next: boolean) {
    if (busy) return;
    if (!next) {
      setReady(false);
      setError(null);
      setFee(null);
    }
    onOpenChange(next);
  }

  async function run(accept: boolean) {
    if (!stripe || !elements || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      let tokenId = fee?.tokenId;
      if (!tokenId) {
        const { error: submitError } = await elements.submit();
        if (submitError) return setError(submitError.message ?? "Check your card details");
        const { name, email, phone, address } = ctx.prefill;
        const { error: tokErr, confirmationToken } = await stripe.createConfirmationToken({
          elements,
          // The form hides every billing field (checkout already has them), so Stripe needs them here.
          params: { payment_method_data: { billing_details: { name, email, phone: phone ?? "", address } } },
        });
        if (tokErr || !confirmationToken) return setError(tokErr?.message ?? "Could not read your card");
        tokenId = confirmationToken.id;
      }
      const r = await pay({ confirmationTokenId: tokenId }, accept);
      if (r.kind === "busy") return;
      if (r.kind === "done") return;
      if (r.kind === "confirm_surcharge") return setFee({ surcharge: r.surcharge, newTotal: r.newTotal, tokenId });
      setFee(null);
      setError(r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (printer) {
    return (
      <ResponsiveDialog open={open} onOpenChange={close} direction="bottom" title="Payment received" description="Your receipt is printing.">
        <div className="flex flex-col items-center pt-1 pb-2">{printer}</div>
      </ResponsiveDialog>
    );
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
          <Button size="lg" disabled={!stripe || !ready || busy} onClick={() => run(false)}>
            <Spinner show={busy} />
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
              // Checkout already has these: hidden here, sent with the token, and prefilled so Link's opt-in is one tick.
              fields: { billingDetails: { name: "never", email: "never", phone: "never", address: "never" } },
              defaultValues: { billingDetails: { name: ctx.prefill.name, email: ctx.prefill.email, phone: ctx.prefill.phone ?? undefined, address: ctx.prefill.address } },
            }}
          />
          <p className="text-xs text-muted-foreground">We&apos;ll save this card for your renewals.</p>
          {ctx.feeNote && <p className="text-xs text-muted-foreground">{ctx.feeNote}. Debit cards have no fee.</p>}
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
        {error && <ErrorAlert message={error} busy={busy} onRetry={fee ? undefined : () => run(false)} />}
        <TrustLine />
      </div>
    </ResponsiveDialog>
  );
}
