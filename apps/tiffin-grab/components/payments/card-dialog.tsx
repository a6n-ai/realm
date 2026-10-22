"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Info, Loader2 } from "lucide-react";
import type { Appearance, Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { ResponsiveDialog } from "@foundry/design-system";
import { Alert, AlertAction, AlertDescription } from "@/components/reui/alert";
import { Button } from "@/components/customer/kit";
import { Skeleton } from "@foundry/ui/skeleton";
import type { CardCheckoutContext } from "@/lib/payments/card-checkout-context";
import { CARD_PAYMENT_METHOD_TYPES } from "@/lib/payments/stripe-appearance";
import type { CardSource } from "@/lib/services/payment-stripe";
import type { PayOutcome } from "./card-pay";
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
          <Button variant="quiet" size="lg" pending={busy} disabled={busy} onClick={onRetry}>
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
      <Button variant="primary" size="lg" className="w-full" pending={busy} disabled={busy} onClick={onConfirm}>
        Pay ${newTotal}
      </Button>
      <Button variant="quiet" size="lg" className="w-full" onClick={onCancel}>Use a different card</Button>
    </div>
  );
}

type Session = { key: number; secret: string | null };
type CommonProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: CardCheckoutContext;
  amountCents: number;
  pay: (source: CardSource, acceptSurcharge: boolean) => Promise<PayOutcome>;
  stripePromise: Promise<Stripe | null>;
  appearance: Appearance;
};

/**
 * The card form. Its own Elements holds a saved-cards session minted when the form opens (one
 * minted at page load would be expired by the time a customer pays), so the dialog shows after the
 * secret arrives. If Stripe cannot load the form with that session, it remounts once without it.
 */
export function CardDialog(p: CommonProps & {
  loadSession?: () => Promise<string | null>;
}) {
  const { open, loadSession, stripePromise, appearance, amountCents } = p;
  const [session, setSession] = useState<Session | null>(null);
  const count = useRef(0);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void (loadSession ? loadSession().catch(() => null) : Promise.resolve(null)).then((secret) => {
      if (live) setSession({ key: ++count.current, secret });
    });
    return () => { live = false; setSession(null); };
  }, [open, loadSession]);

  if (!session) return null;
  return (
    <Elements
      key={session.key}
      stripe={stripePromise}
      options={{
        mode: "payment", amount: amountCents, currency: "cad", setupFutureUsage: "off_session", allowedPaymentMethodTypes: CARD_PAYMENT_METHOD_TYPES, appearance,
        ...(session.secret ? { customerSessionClientSecret: session.secret } : {}),
      }}
    >
      <CardForm
        {...p}
        onLoadError={() => setSession((s) => (s?.secret ? { key: ++count.current, secret: null } : s))}
      />
    </Elements>
  );
}

function CardForm({ open, onOpenChange, ctx, amountCents, pay, onLoadError }: CommonProps & { onLoadError: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [fee, setFee] = useState<{ surcharge: string; newTotal: string; tokenId: string } | null>(null);
  // A saved card chosen inside the form: its billing details and redisplay flag belong to the card, not to this token.
  const [savedPicked, setSavedPicked] = useState(false);

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
          // "always" lets a card saved here show up again, removable, in the next card form.
          ...(savedPicked ? {} : { params: { payment_method_data: { allow_redisplay: "always" as const, billing_details: { name, email, phone: phone ?? "", address } } } }),
        });
        if (tokErr || !confirmationToken) return setError(tokErr?.message ?? "Could not read your card");
        tokenId = confirmationToken.id;
      }
      const r = await pay({ confirmationTokenId: tokenId }, accept);
      if (r.kind === "busy") return;
      // The charge settled: close so the page shows the receipt (close() would refuse while busy).
      if (r.kind === "done") return onOpenChange(false);
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

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      direction="bottom"
      title="Pay by card"
      description="Your card is entered securely with Stripe."
      footer={
        fee ? null : (
          <Button variant="primary" size="lg" pending={busy} disabled={!stripe || !ready || busy} onClick={() => run(false)}>
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
            onLoadError={onLoadError}
            onChange={(e) => setSavedPicked(!!e.value.payment_method)}
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
