"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, ExpressCheckoutElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useTheme } from "@foundry/themes";
import { Button, Notice } from "@/components/customer/kit";
import type { CardCheckoutContext } from "@/lib/payments/card-checkout-context";
import { stripeAppearance } from "@/lib/payments/stripe-appearance";
import type { CardSource, PayByCardResult } from "@/lib/services/payment-stripe";
import { CardDialog, SurchargeConfirm, dollars } from "./card-dialog";
import { SavedCards } from "./saved-cards";
import { TrustLine } from "./trust-line";

export type PayOutcome =
  | { kind: "done" }
  | { kind: "confirm_surcharge"; surcharge: string; newTotal: string }
  | { kind: "error"; message: string };

type Pay = (source: CardSource, acceptSurcharge: boolean) => Promise<PayOutcome>;
type PanelCtx = { ctx: CardCheckoutContext; amountCents: number; busy: boolean; pay: Pay };

const PayCtx = createContext<PanelCtx | null>(null);
const usePanel = () => {
  const c = useContext(PayCtx);
  if (!c) throw new Error("Pay pieces must sit inside CardPayProvider");
  return c;
};

type Props = {
  ctx: CardCheckoutContext;
  amountCents: number;
  onPay: (source: CardSource, acceptSurcharge: boolean) => Promise<PayByCardResult | { error: string }>;
  onPaid: () => void;
  onProcessing: () => void;
  abandon: () => Promise<void>;
  children: ReactNode;
};

export function CardPayProvider(props: Props) {
  const { resolvedTheme } = useTheme();
  const key = props.ctx.publishableKey;
  const stripePromise = useMemo(() => (key ? loadStripe(key) : null), [key]);
  if (!stripePromise) return null;
  return (
    <Elements
      stripe={stripePromise}
      options={{ mode: "payment", amount: props.amountCents, currency: "cad", setupFutureUsage: "off_session", appearance: stripeAppearance(resolvedTheme === "dark" ? "dark" : "light") }}
    >
      <Runner {...props} />
    </Elements>
  );
}

function Runner({ ctx, amountCents, onPay, onPaid, onProcessing, abandon, children }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    elements?.update({ amount: amountCents });
  }, [elements, amountCents]);

  const pay: Pay = async (source, accept) => {
    if (!stripe) return { kind: "error", message: "Payments are still loading. Please try again." };
    setBusy(true);
    try {
      const r = await onPay(source, accept);
      if ("error" in r) return { kind: "error", message: r.error };
      switch (r.kind) {
        case "succeeded":
          onPaid();
          return { kind: "done" };
        case "processing":
          onProcessing();
          return { kind: "done" };
        case "confirm_surcharge":
          return { kind: "confirm_surcharge", surcharge: r.surcharge, newTotal: r.newTotal };
        case "failed":
          return { kind: "error", message: r.message };
        case "requires_action": {
          const { error } = await stripe.handleNextAction({ clientSecret: r.clientSecret });
          if (error) {
            await abandon().catch(() => undefined);
            return { kind: "error", message: error.message ?? "Authentication failed" };
          }
          // The webhook settles it; the caller confirms the final state.
          onProcessing();
          return { kind: "done" };
        }
      }
    } catch (e) {
      return { kind: "error", message: e instanceof Error ? e.message : "Something went wrong. Please try again." };
    } finally {
      setBusy(false);
    }
  };

  return <PayCtx.Provider value={{ ctx, amountCents, busy, pay }}>{children}</PayCtx.Provider>;
}

type Fee = { surcharge: string; newTotal: string; source: CardSource };

export function ExpressPay() {
  const { busy, pay } = usePanel();
  const stripe = useStripe();
  const elements = useElements();
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fee, setFee] = useState<Fee | null>(null);

  async function settle(source: CardSource, accept: boolean) {
    const r = await pay(source, accept);
    setFee(r.kind === "confirm_surcharge" ? { surcharge: r.surcharge, newTotal: r.newTotal, source } : null);
    setError(r.kind === "error" ? r.message : null);
  }

  async function onConfirm() {
    if (!stripe || !elements) return;
    const { error: submitError } = await elements.submit();
    if (submitError) return setError(submitError.message ?? "Wallet payment failed");
    const { error: tokErr, confirmationToken } = await stripe.createConfirmationToken({ elements });
    if (tokErr || !confirmationToken) return setError(tokErr?.message ?? "Wallet payment failed");
    await settle({ confirmationTokenId: confirmationToken.id }, false);
  }

  return (
    <div className={available ? "flex flex-col gap-3" : "hidden"}>
      <ExpressCheckoutElement onReady={(e) => setAvailable(Boolean(e.availablePaymentMethods))} onConfirm={onConfirm} />
      {fee && <SurchargeConfirm {...fee} busy={busy} onConfirm={() => settle(fee.source, true)} onCancel={() => setFee(null)} />}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

export function CardPay() {
  const { ctx, amountCents, busy, pay } = usePanel();
  const cards = ctx.savedCards;
  const [selected, setSelected] = useState((cards.find((c) => c.isDefault) ?? cards[0])?.paymentMethodId ?? "");
  const [dialog, setDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fee, setFee] = useState<{ surcharge: string; newTotal: string } | null>(null);

  async function paySaved(accept: boolean) {
    setError(null);
    const r = await pay({ savedPaymentMethodId: selected }, accept);
    setFee(r.kind === "confirm_surcharge" ? r : null);
    if (r.kind === "error") setError(r.message);
  }

  return (
    <div className="flex flex-col gap-4">
      {cards.length > 0 && <SavedCards cards={cards} value={selected} onChange={(id) => { setSelected(id); setFee(null); }} />}
      {fee ? (
        <SurchargeConfirm {...fee} busy={busy} onConfirm={() => paySaved(true)} onCancel={() => setFee(null)} />
      ) : cards.length > 0 ? (
        <>
          <Button variant="hero" size="lg" className="w-full" pending={busy} onClick={() => paySaved(false)}>Pay {dollars(amountCents)}</Button>
          <Button variant="quiet" className="w-full" onClick={() => setDialog(true)}>Use another card</Button>
        </>
      ) : (
        <Button variant="hero" size="lg" className="w-full" onClick={() => setDialog(true)}>Add a card and pay</Button>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <TrustLine />
      <CardDialog open={dialog} onOpenChange={setDialog} ctx={ctx} amountCents={amountCents} pay={pay} />
    </div>
  );
}
