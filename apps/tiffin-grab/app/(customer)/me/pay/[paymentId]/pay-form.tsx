"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button, Card, Notice, PageHeader } from "@/components/customer/kit";
import { cn } from "@/components/customer/kit/cn";
import { submitCardPayment, confirmReturn } from "./actions";

type Line = { label: string; amount: number };

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

function Row({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5 text-sm", strong && "border-t border-[var(--border)] pt-3 text-base font-semibold")}>
      <span>{label}</span>
      <span className="tabular-nums">{money(amount)}</span>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <PageHeader eyebrow="Payment" title="Pay by" accent="card" />
      <Card className="space-y-4 p-5">{children}</Card>
    </div>
  );
}

export function PayForm(p: {
  paymentId: string;
  status: string;
  publishableKey: string | null;
  amountCents: number;
  lines: Line[];
  total: number;
  isReturn: boolean;
}) {
  const stripePromise = useMemo(() => (p.publishableKey ? loadStripe(p.publishableKey) : null), [p.publishableKey]);
  if (p.status === "paid" || p.status === "simulated_paid") return <Paid />;
  if (!stripePromise) {
    return (
      <Shell>
        <Notice>Card payments are unavailable right now. You can pay by e-Transfer from Bills.</Notice>
        <Link href="/me/wallet?tab=bills" className="text-sm font-semibold underline">Open Bills</Link>
      </Shell>
    );
  }
  if (p.isReturn) return <ReturnState paymentId={p.paymentId} />;
  return (
    <Elements
      stripe={stripePromise}
      options={{ mode: "payment", amount: p.amountCents, currency: "cad", setupFutureUsage: "off_session", appearance: { theme: "stripe" } }}
    >
      <Inner paymentId={p.paymentId} lines={p.lines} total={p.total} />
    </Elements>
  );
}

function Inner(p: { paymentId: string; lines: Line[]; total: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [surcharge, setSurcharge] = useState<{ surcharge: string; newTotal: string; tokenId: string } | null>(null);
  const [done, setDone] = useState<"paid" | "processing" | null>(null);

  async function run(accept: boolean, existingToken?: string) {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    try {
      let tokenId = existingToken;
      if (!tokenId) {
        const { error: submitError } = await elements.submit();
        if (submitError) {
          setError(submitError.message ?? "Check your card details");
          return;
        }
        const { error: tokErr, confirmationToken } = await stripe.createConfirmationToken({ elements });
        if (tokErr || !confirmationToken) {
          setError(tokErr?.message ?? "Could not read your card");
          return;
        }
        tokenId = confirmationToken.id;
      }
      const r = await submitCardPayment(p.paymentId, tokenId, accept);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      if (r.kind === "confirm_surcharge") {
        setSurcharge({ surcharge: r.surcharge, newTotal: r.newTotal, tokenId });
      } else if (r.kind === "requires_action") {
        const { error: actErr } = await stripe.handleNextAction({ clientSecret: r.clientSecret });
        if (actErr) {
          setError(actErr.message ?? "Authentication failed");
          return;
        }
        const c = await confirmReturn(p.paymentId);
        setDone("error" in c || !c.paid ? "processing" : "paid");
      } else if (r.kind === "failed") {
        setError(r.message);
      } else {
        setDone(r.kind === "succeeded" ? "paid" : "processing");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done === "paid") return <Paid />;
  if (done === "processing") return <Processing />;

  return (
    <Shell>
      <div>
        {p.lines.map((l, i) => <Row key={`${i}-${l.label}`} label={l.label} amount={l.amount} />)}
        <Row label="Total" amount={p.total} strong />
      </div>
      {surcharge ? (
        <div className="space-y-3">
          <Notice>
            Credit cards carry a ${surcharge.surcharge} card fee. New total ${surcharge.newTotal}. Debit cards have no fee.
          </Notice>
          {error && <Notice tone="error">{error}</Notice>}
          <Button variant="hero" size="lg" className="w-full" pending={busy} onClick={() => run(true, surcharge.tokenId)}>
            Pay ${surcharge.newTotal}
          </Button>
          <Button variant="quiet" className="w-full" onClick={() => setSurcharge(null)}>Use a different card</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <PaymentElement options={{ layout: "accordion" }} />
          {error && <Notice tone="error">{error}</Notice>}
          <Button variant="hero" size="lg" className="w-full" pending={busy} disabled={!stripe} onClick={() => run(false)}>
            {busy ? "Processing…" : `Pay $${p.total.toFixed(2)}`}
          </Button>
        </div>
      )}
    </Shell>
  );
}

function ReturnState({ paymentId }: { paymentId: string }) {
  const [paid, setPaid] = useState<boolean | null>(null);
  useEffect(() => {
    confirmReturn(paymentId).then((r) => setPaid(!("error" in r) && r.paid));
  }, [paymentId]);
  if (paid === null) return <Shell><Notice>Confirming your payment…</Notice></Shell>;
  return paid ? <Paid /> : <Processing />;
}

function Processing() {
  return (
    <Shell>
      <Notice>Payment is processing. We&apos;ll confirm by email. You can leave this page.</Notice>
      <Link href="/me/wallet?tab=bills" className="text-sm font-semibold underline">Back to Bills</Link>
    </Shell>
  );
}

function Paid() {
  return (
    <Shell>
      <Notice>Paid, thank you. Your plan is confirmed.</Notice>
      <Link href="/me/deliveries" className="text-sm font-semibold underline">View deliveries</Link>
    </Shell>
  );
}
