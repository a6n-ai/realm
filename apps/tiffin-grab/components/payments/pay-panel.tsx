"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { preconnect } from "react-dom";
import { loadStripe, type Appearance, type Stripe } from "@stripe/stripe-js";
import { Elements, ExpressCheckoutElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useTheme } from "@foundry/themes";
import { Button } from "@/components/ui/button";
import { CardBrandMark, cardBrandName, cardExpiry, defaultSavedCard } from "@/components/checkout/payment-method-cards";
import { Skeleton } from "@foundry/ui/skeleton";
import type { CardCheckoutContext } from "@/lib/payments/card-checkout-context";
import { stripeAppearance } from "@/lib/payments/stripe-appearance";
import type { CardSource, PayByCardResult } from "@/lib/services/payment-stripe";
import { CardDialog, ErrorAlert, Spinner, SurchargeConfirm, dollars } from "./card-dialog";
import { TrustLine } from "./trust-line";
import { ReceiptPrinter, type Receipt } from "./receipt-printer";

export type PayOutcome =
  | { kind: "done" }
  | { kind: "confirm_surcharge"; surcharge: string; newTotal: string }
  | { kind: "busy" }
  | { kind: "error"; message: string };

type Pay = (source: CardSource, acceptSurcharge: boolean) => Promise<PayOutcome>;

/** What the server reported about the charge; every field is null when it could not (3DS return, prior attempt). */
export type PaidInfo = { paidWith: string | null; totalCents: number | null; feeCents: number };
type Link = { label: string; href: string };
export type ReceiptView = { receipt: Receipt; secondary?: Link };
type Paid = ReceiptView & { outcome: "paid" | "processing"; stage: "processing" | "printing" | "complete" };

const DELIVERIES: Link = { label: "Go to my deliveries", href: "/me/deliveries" };

type PanelCtx = {
  ctx: CardCheckoutContext; amountCents: number; stripePromise: Promise<Stripe | null>; appearance: Appearance;
  customerSession?: () => Promise<string | null>; busy: boolean; disabled: boolean; pay: Pay;
  paid: Paid | null; printed: () => void; dialogOpen: boolean; setDialogOpen: (open: boolean) => void;
};

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
  /** Side effects once the charge settled (clear the wizard, block Back); the receipt shows in place, nothing navigates. */
  onPaid: () => void;
  onProcessing: () => void;
  /** The receipt for this order, called once at settle time. */
  receipt: (info: PaidInfo) => ReceiptView;
  abandon: () => Promise<void>;
  /** Runs after a successful 3DS challenge so the caller can read the settled state. */
  afterAction: () => Promise<{ outcome: "paid" | "processing"; receipt?: PaidInfo }>;
  /** The amount is being re-quoted: no pay path may run until it settles. */
  disabled?: boolean;
  /** A fresh saved-cards session secret, asked for each time the card form opens (a secret minted at page load would expire). */
  customerSession?: () => Promise<string | null>;
  children: ReactNode;
};

const loaded = new Map<string, Promise<Stripe | null>>();
/** One Stripe.js load per key for the life of the page, so a step change never reloads it. */
function stripeFor(key: string) {
  let p = loaded.get(key);
  if (!p) loaded.set(key, (p = loadStripe(key)));
  return p;
}

/** Starts Stripe.js early (checkout calls this on step 1) so the wallet button is ready by Pay. */
export function useWarmStripe(key: string | null | undefined) {
  if (key) {
    preconnect("https://js.stripe.com");
    preconnect("https://api.stripe.com");
  }
  useEffect(() => {
    if (key) void stripeFor(key);
  }, [key]);
}

export function CardPayProvider(props: Props) {
  const { resolvedTheme } = useTheme();
  const key = props.ctx.publishableKey;
  useWarmStripe(key);
  const stripePromise = useMemo(() => (key ? stripeFor(key) : null), [key]);
  if (!stripePromise) return null;
  const appearance = stripeAppearance(resolvedTheme === "dark" ? "dark" : "light");
  return (
    <Elements
      stripe={stripePromise}
      options={{ mode: "payment", amount: props.amountCents, currency: "cad", setupFutureUsage: "off_session", appearance }}
    >
      <Runner {...props} stripePromise={stripePromise} appearance={appearance} />
    </Elements>
  );
}

function Runner({ ctx, amountCents, stripePromise, appearance, customerSession, onPay, onPaid, onProcessing, receipt, abandon, afterAction, disabled = false, children }: Props & { stripePromise: Promise<Stripe | null>; appearance: Appearance }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState<Paid | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const inFlight = useRef(false);

  const settle = (outcome: Paid["outcome"], info: PaidInfo) => {
    setPaid({ outcome, stage: "processing", ...receipt(info) });
    (outcome === "paid" ? onPaid : onProcessing)();
  };
  // A short "processing" beat first, so the paper feeds out of a printer that was visibly working.
  const feeding = paid?.outcome === "paid" && paid.stage === "processing";
  useEffect(() => {
    if (!feeding) return;
    const t = setTimeout(() => setPaid((p) => (p ? { ...p, stage: "printing" } : p)), 700);
    return () => clearTimeout(t);
  }, [feeding]);
  const printed = () => setPaid((p) => (p ? { ...p, stage: "complete" } : p));

  useEffect(() => {
    elements?.update({ amount: amountCents });
  }, [elements, amountCents]);

  const pay: Pay = async (source, accept) => {
    if (inFlight.current || disabled) return { kind: "busy" };
    if (!stripe) return { kind: "error", message: "Payments are still loading. Please try again." };
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await onPay(source, accept);
      if ("error" in r) return { kind: "error", message: r.error };
      switch (r.kind) {
        case "succeeded":
          settle("paid", { paidWith: r.receipt?.paidWith ?? null, totalCents: r.receipt?.totalCents ?? null, feeCents: r.receipt?.feeCents ?? 0 });
          return { kind: "done" };
        case "processing":
          settle("processing", { paidWith: null, totalCents: null, feeCents: 0 });
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
          const settled = await afterAction().catch((): Awaited<ReturnType<typeof afterAction>> => ({ outcome: "processing" }));
          settle(settled.outcome, settled.receipt ?? { paidWith: null, totalCents: null, feeCents: 0 });
          return { kind: "done" };
        }
      }
    } catch (e) {
      return { kind: "error", message: e instanceof Error ? e.message : "Something went wrong. Please try again." };
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return <PayCtx.Provider value={{ ctx, amountCents, stripePromise, appearance, customerSession, busy: busy || disabled, disabled, pay, paid, printed, dialogOpen, setDialogOpen }}>{children}</PayCtx.Provider>;
}

function Printer() {
  const { paid, printed } = usePanel();
  if (!paid) return null;
  return (
    <ReceiptPrinter
      stage={paid.stage}
      receipt={paid.receipt}
      action={DELIVERIES}
      secondary={paid.secondary}
      onPrinted={printed}
      status={paid.outcome === "paid" ? "Paid" : "Processing"}
    />
  );
}

/** Once the charge settled and no dialog holds the printer, the whole pay area gives way to the receipt. */
export function PaidSwitch({ children }: { children: ReactNode }) {
  const { paid, dialogOpen } = usePanel();
  return paid && !dialogOpen ? <div className="mx-auto flex w-full max-w-lg flex-col items-center py-6"><Printer /></div> : children;
}

type Fee = { surcharge: string; newTotal: string; source: CardSource };

/** `height` (40-55) matches the wallet button to the Pay button beside it. */
export function ExpressPay({ height = 48 }: { height?: number } = {}) {
  const { busy, disabled, pay } = usePanel();
  const stripe = useStripe();
  const elements = useElements();
  const { paid } = usePanel();
  const [wallets, setWallets] = useState<"loading" | "ready" | "none">("loading");
  const [error, setError] = useState<string | null>(null);
  const [fee, setFee] = useState<Fee | null>(null);
  const starting = useRef(false);

  async function settle(source: CardSource, accept: boolean) {
    const r = await pay(source, accept);
    if (r.kind === "busy") return;
    setFee(r.kind === "confirm_surcharge" ? { surcharge: r.surcharge, newTotal: r.newTotal, source } : null);
    setError(r.kind === "error" ? r.message : null);
  }

  async function onConfirm() {
    if (!stripe || !elements || busy || starting.current) return;
    starting.current = true;
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) return setError(submitError.message ?? "Wallet payment failed");
      const { error: tokErr, confirmationToken } = await stripe.createConfirmationToken({ elements });
      if (tokErr || !confirmationToken) return setError(tokErr?.message ?? "Wallet payment failed");
      await settle({ confirmationTokenId: confirmationToken.id }, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet payment failed");
    } finally {
      starting.current = false;
    }
  }

  if (paid) return null;
  return (
    <div className={wallets === "none" ? "hidden" : "flex flex-col gap-3"}>
      {/* The slot holds the button's height while Stripe loads, so nothing jumps when it appears.
          While re-quoting it dims and goes inert rather than hiding. */}
      <div className="relative" style={{ minHeight: height }}>
        {wallets === "loading" && <Skeleton aria-hidden className="absolute inset-0" />}
        <div
          inert={disabled || wallets !== "ready"}
          className={`transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${wallets !== "ready" ? "opacity-0" : disabled ? "opacity-50" : ""}`}
        >
          <ExpressCheckoutElement
            options={{ buttonHeight: height }}
            onReady={(e) => setWallets(e.availablePaymentMethods ? "ready" : "none")}
            onConfirm={onConfirm}
          />
        </div>
      </div>
      {fee && <SurchargeConfirm {...fee} busy={busy} onConfirm={() => settle(fee.source, true)} onCancel={() => setFee(null)} />}
      {error && <ErrorAlert message={error} busy={busy} />}
    </div>
  );
}

type Held = { surcharge: string; newTotal: string };

/**
 * The customer's default (else newest) saved card with a one-tap pay, above the payment options.
 * It charges through the same pay path as everything else (lock, amount guard, surcharge confirmation).
 * `onSelect` is for a checkout whose chosen method is not Stripe: the total shown belongs to that
 * method, so the first tap switches to Stripe and the next tap pays the re-quoted amount.
 */
export function LastUsedCard({ onSelect }: { onSelect?: () => void }) {
  const { ctx, amountCents, busy, pay, paid } = usePanel();
  const [error, setError] = useState<string | null>(null);
  const [fee, setFee] = useState<Held | null>(null);
  const id = defaultSavedCard(ctx.savedCards);
  const card = ctx.savedCards.find((c) => c.paymentMethodId === id);
  if (!card || paid) return null;

  async function payWith(accept: boolean) {
    setError(null);
    const r = await pay({ savedPaymentMethodId: card!.paymentMethodId }, accept);
    if (r.kind === "busy") return;
    setFee(r.kind === "confirm_surcharge" ? r : null);
    if (r.kind === "error") setError(r.message);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="border-border bg-card flex w-full items-center gap-3 rounded-xl border p-3">
        <span aria-hidden className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
          <CardBrandMark brand={card.brand} className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-muted-foreground text-xs">Last used</span>
          <span className="truncate text-sm font-medium">{cardBrandName(card.brand)} •••• {card.last4 ?? "----"}</span>
          <span className="text-muted-foreground text-xs">Expires {cardExpiry(card)}</span>
        </div>
        <Button
          className="shrink-0"
          disabled={busy}
          onClick={() => (onSelect ? onSelect() : void payWith(false))}
        >
          <Spinner show={busy} />
          {onSelect ? "Use this card" : `Pay ${dollars(amountCents)}`}
        </Button>
      </div>
      {fee && <SurchargeConfirm {...fee} busy={busy} onConfirm={() => payWith(true)} onCancel={() => setFee(null)} />}
      {error && <ErrorAlert message={error} busy={busy} onRetry={fee ? undefined : () => payWith(false)} />}
    </div>
  );
}

/** The pay action for the Stripe method: opens the card form, where saved cards (removable) and a new card both live. */
export function CardPay({ dialogOpen, onDialogOpenChange }: {
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
}) {
  const { ctx, amountCents, pay, paid, setDialogOpen, stripePromise, appearance, customerSession } = usePanel();
  // The provider needs to know whether a dialog holds the printer, or it would swap the page out from under it.
  useEffect(() => {
    setDialogOpen(dialogOpen);
    return () => setDialogOpen(false);
  }, [dialogOpen, setDialogOpen]);

  if (paid) return <CardDialog open={dialogOpen} onOpenChange={onDialogOpenChange} ctx={ctx} amountCents={amountCents} pay={pay} printer={<Printer />} stripePromise={stripePromise} appearance={appearance} />;
  return (
    <div className="flex flex-col gap-4">
      <Button size="lg" className="w-full" onClick={() => onDialogOpenChange(true)}>Pay by card</Button>
      <TrustLine />
      <CardDialog open={dialogOpen} onOpenChange={onDialogOpenChange} ctx={ctx} amountCents={amountCents} pay={pay} printer={null} stripePromise={stripePromise} appearance={appearance} loadSession={customerSession} />
    </div>
  );
}
