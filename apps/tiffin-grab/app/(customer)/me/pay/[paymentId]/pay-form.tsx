"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Card, Notice, PageHeader } from "@/components/customer/kit";
import { cn } from "@/components/customer/kit/cn";
import { CardPay, CardPayProvider, ExpressPay, PaidSwitch, type PaidInfo, type ReceiptView } from "@/components/payments/pay-panel";
import { markPaid } from "@/lib/payments/paid-flag";
import { PaidPage } from "@/components/payments/paid-page";
import { PaymentMethodCards } from "@/components/checkout/payment-method-cards";
import type { CardCheckoutContext } from "@/lib/payments/card-checkout-context";
import { submitCardPayment, confirmReturn, abandonCard, newCustomerSession } from "./actions";

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

function Shell({ children, after }: { children: ReactNode; after?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5">
      <PageHeader eyebrow="Payment" title="Pay by" accent="card" />
      <Card className="flex flex-col gap-4 p-5">{children}</Card>
      {after}
    </div>
  );
}

/** Stripe opens the card form, which lists saved cards. */
function PayChoices({ ctx }: { ctx: CardCheckoutContext }) {
  const [dialog, setDialog] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="pay-with" className="flex flex-col gap-3">
        <h2 id="pay-with" className="text-sm font-semibold">Pay with</h2>
        <PaymentMethodCards methods={[{ id: "stripe", label: "Stripe" }]} value="stripe" onChange={() => setDialog(true)} labelledBy="pay-with" feeNote={ctx.feeNote} />
        <ExpressPay />
        <CardPay dialogOpen={dialog} onDialogOpenChange={setDialog} />
      </section>
    </div>
  );
}

export function PayForm(p: {
  paymentId: string;
  /** The order's reference, printed on the receipt. */
  deploymentId: string;
  planTitle: string;
  planSubtitle: string | null;
  status: string;
  method: string;
  ctx: CardCheckoutContext;
  amountCents: number;
  lines: Line[];
  total: number;
  isReturn: boolean;
  /** Why this payment can no longer be paid (cancelled order, expired or void link), or null. */
  closed?: string | null;
}) {
  if (p.status === "paid" || p.status === "simulated_paid") return <Paid />;
  if (p.method !== "stripe" || (p.status !== "awaiting_payment" && p.status !== "rejected")) {
    return (
      <Shell>
        <Notice>This payment can&apos;t be paid online.</Notice>
        <Link href="/me/wallet?tab=bills" className="text-sm font-semibold underline">Open Bills</Link>
      </Shell>
    );
  }
  if (!p.ctx.publishableKey) {
    return (
      <Shell>
        <Notice>Card payments are paused right now. Please contact us.</Notice>
        <Link href="/me/wallet?tab=bills" className="text-sm font-semibold underline">Open Bills</Link>
      </Shell>
    );
  }
  // A return from 3DS still confirms: the card may have been charged just before the link closed.
  if (p.isReturn) return <ReturnState paymentId={p.paymentId} />;
  if (p.closed) {
    return (
      <Shell>
        <Notice>{p.closed}</Notice>
        <Link href="/me/wallet?tab=bills" className="text-sm font-semibold underline">Open Bills</Link>
      </Shell>
    );
  }
  return (
    <CardPayProvider
      ctx={p.ctx}
      amountCents={p.amountCents}
      onPay={(source, accept) => submitCardPayment(p.paymentId, source, accept)}
      customerSession={newCustomerSession}
      onPaid={() => markPaid(p.deploymentId)}
      onProcessing={() => markPaid(p.deploymentId)}
      receipt={(info) => receiptFor(p, info)}
      abandon={async () => { await abandonCard(p.paymentId); }}
      afterAction={async () => {
        const c = await confirmReturn(p.paymentId);
        return "error" in c || !c.paid ? { outcome: "processing" as const } : { outcome: "paid" as const, receipt: c.receipt };
      }}
    >
      <PaidSwitch whenPaid={(v) => (
        <div className="mx-auto max-w-lg">
          <PaidPage kind={v.outcome === "paid" ? "paid" : "processing"} subtitle={v.outcome === "paid" ? "We've emailed your receipt." : "We'll confirm by email."} receipt={v.receipt} ready={v.ready} primary={v.primary} secondary={v.secondary} />
        </div>
      )}>
        <Shell after={<PayChoices ctx={p.ctx} />}>
          <div>
            {p.lines.map((l, i) => <Row key={`${i}-${l.label}`} label={l.label} amount={l.amount} />)}
            <Row label="Total" amount={p.total} strong />
          </div>
        </Shell>
      </PaidSwitch>
    </CardPayProvider>
  );
}

const toCents = (n: number) => Math.round(n * 100);

function receiptFor(p: { deploymentId: string; planTitle: string; planSubtitle: string | null; lines: Line[]; amountCents: number }, info: PaidInfo): ReceiptView {
  const total = info.totalCents ?? p.amountCents;
  return {
    receipt: {
      title: p.planTitle,
      subtitle: p.planSubtitle,
      lines: [...p.lines.map((l) => ({ label: l.label, amount: toCents(l.amount) })), ...(info.feeCents > 0 ? [{ label: "Card fee", amount: info.feeCents }] : [])],
      total,
      orderRef: p.deploymentId,
      paidWith: info.paidWith,
      paidAt: Date.now(),
    },
  };
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
