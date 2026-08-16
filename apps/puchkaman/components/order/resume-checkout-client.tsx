"use client";

import { useState } from "react";
import { Btn, Pill } from "@/components/brutal/shared";
import { CloverCardForm } from "@/components/order/clover-card-form";
import { money } from "@/lib/cart/types";
import type { ResumableCheckout } from "@/lib/services/orders.service";

/**
 * Reopens payment for one already-created order. Mounts the same
 * `CloverCardForm` iframe as checkout and the tracking page's "pay balance" —
 * the resume link's only job is skipping straight to that step.
 */
export function ResumeCheckoutClient({ order }: { order: ResumableCheckout }) {
  const [tokenize, setTokenize] = useState<(() => Promise<string>) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  async function pay() {
    if (!tokenize || busy) return;
    setBusy(true);
    setError(null);
    try {
      const source = await tokenize();
      const res = await fetch("/api/checkout/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderPublicId: order.orderPublicId, source }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        setError(body?.detail ?? "Payment failed. Your card was not charged.");
        return;
      }
      setPaid(true);
    } catch {
      setError("Payment failed. Your card was not charged.");
    } finally {
      setBusy(false);
    }
  }

  if (paid) {
    return (
      <div className="card card--green surface-green" style={{ color: "#fff", padding: 28 }}>
        <Pill variant="yellow">PAID</Pill>
        <h2 className="display" style={{ fontSize: "clamp(1.8rem,4vw,2.4rem)", margin: "12px 0" }}>
          Order locked in
        </h2>
        <p style={{ fontWeight: 500 }}>
          We charged {money(order.total)} and sent the order to the kitchen POS.
        </p>
        <Btn href={`/track/${order.orderPublicId}`} variant="ink" style={{ marginTop: 16 }}>
          Track order
        </Btn>
      </div>
    );
  }

  return (
    <div className="card checkout-panel">
      <div className="checkout-panel__head">
        <h2 className="display checkout-panel__title" style={{ margin: 0 }}>
          Pay with card
        </h2>
        <Pill variant="green">Secure checkout</Pill>
      </div>
      <p className="checkout-hint">
        Order {order.orderPublicId}
        {order.environment === "sandbox" ? " · sandbox" : ""}. Card details go straight to our
        payment processor — this site never sees them.
      </p>

      <CloverCardForm
        pakmsKey={order.pakmsKey}
        sdkUrl={order.checkoutSdkUrl}
        onReady={(fn) => setTokenize(() => fn)}
      />

      {error ? (
        <p className="form-error" role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}

      <div className="checkout-pay-actions">
        <Btn
          variant="green"
          size="lg"
          block
          disabled={busy || !tokenize}
          onClick={() => void pay()}
          className="checkout-submit"
        >
          <span className="label-swap" key={busy ? "busy" : tokenize ? "ready" : "loading"}>
            {busy ? "Processing…" : !tokenize ? "Loading card form…" : `Pay ${money(order.total)}`}
          </span>
        </Btn>
      </div>
    </div>
  );
}
