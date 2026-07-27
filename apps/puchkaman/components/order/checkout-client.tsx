"use client";

import { useCallback, useEffect, useState } from "react";
import { Btn, Pill } from "@/components/brutal/shared";
import { CartLines } from "@/components/cart/cart-lines";
import { useCart } from "@/components/cart/cart-provider";
import { CloverCardForm } from "@/components/order/clover-card-form";
import { money } from "@/lib/cart/types";

type CheckoutSession = {
  orderPublicId: string;
  cloverOrderId: string;
  total: number;
  currency: string;
  customerEmail: string;
  pakmsKey: string;
  checkoutSdkUrl: string;
  environment: "sandbox" | "production";
};

type Step = "review" | "pay" | "done";

export function CheckoutClient() {
  const { items, subtotal, clear, hydrated } = useCart();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<Step>("review");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [tokenize, setTokenize] = useState<(() => Promise<string>) | null>(null);
  const [paidTotal, setPaidTotal] = useState<number | null>(null);

  const onCardReady = useCallback((fn: () => Promise<string>) => {
    setTokenize(() => fn);
  }, []);

  useEffect(() => {
    if (step === "pay" && items.length === 0 && !session) {
      setStep("review");
    }
  }, [items.length, session, step]);

  async function startCheckout() {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required");
      return;
    }
    if (items.length === 0) {
      setError("Add at least one item from the menu");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productPublicId: i.productPublicId,
            quantity: i.quantity,
          })),
          contact: {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim() || null,
            note: note.trim() || null,
          },
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (CheckoutSession & { detail?: string })
        | null;
      if (!res.ok) {
        setError(data?.detail ?? "Could not create order");
        return;
      }
      setSession(data as CheckoutSession);
      setStep("pay");
    } catch {
      setError("Could not create order");
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!session || !tokenize) {
      setError("Payment form is still loading");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const source = await tokenize();
      const res = await fetch("/api/checkout/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderPublicId: session.orderPublicId,
          source,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        detail?: string;
        total?: number;
      } | null;
      if (!res.ok) {
        setError(data?.detail ?? "Payment failed");
        return;
      }
      setPaidTotal(data?.total ?? session.total);
      clear();
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated) {
    return <p style={{ fontWeight: 600 }}>Loading checkout…</p>;
  }

  if (step === "done") {
    return (
      <div className="card card--red surface-red checkout-done" style={{ color: "#fff", padding: 28 }}>
        <Pill variant="yellow">PAID</Pill>
        <h2 className="display" style={{ fontSize: "clamp(1.8rem,4vw,2.4rem)", margin: "12px 0" }}>
          Order locked in
        </h2>
        <p style={{ fontWeight: 500, maxWidth: 440 }}>
          Thanks{name ? `, ${name}` : ""} — we charged {money(paidTotal ?? 0)} and sent the order to
          the kitchen POS. Ready in about 15 minutes at 3315 Danforth Ave.
        </p>
        <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Btn page="eats" variant="yellow">
            Back to menu
          </Btn>
          <Btn
            variant="cream"
            onClick={() => {
              setStep("review");
              setSession(null);
              setPaidTotal(null);
              setError(null);
            }}
          >
            Start another order
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-grid">
      <section className="card card--cream" style={{ padding: "clamp(18px,3vw,26px)" }}>
        <h2 className="display" style={{ fontSize: "1.45rem", marginBottom: 14 }}>
          Your bag
        </h2>
        {items.length === 0 ? (
          <div>
            <p style={{ fontWeight: 600, marginBottom: 16 }}>
              Cart is empty. Add Clover-linked in-stock items from the menu first.
            </p>
            <Btn page="eats" variant="red">
              Browse menu →
            </Btn>
          </div>
        ) : (
          <CartLines items={items} />
        )}
      </section>

      <section className="card" style={{ padding: "clamp(18px,3vw,26px)", background: "var(--white)" }}>
        <div className="flex center between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <h2 className="display" style={{ fontSize: "1.45rem", margin: 0 }}>
            {step === "pay" ? "Pay with card" : "Contact & pay"}
          </h2>
          <strong style={{ fontSize: "1.25rem" }}>{money(session?.total ?? subtotal)}</strong>
        </div>

        {step === "review" ? (
          <>
            <p style={{ fontWeight: 500, opacity: 0.8, marginBottom: 16, fontSize: "0.9rem" }}>
              Pickup at 3315 Danforth Ave · ~15 min. Final total is calculated on the server —
              client prices are estimates only.
            </p>
            <div className="checkout-fields">
              <label className="checkout-label">
                Name *
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  autoComplete="name"
                  required
                />
              </label>
              <label className="checkout-label">
                Email *
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  autoComplete="email"
                  required
                />
              </label>
              <label className="checkout-label">
                Phone
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input"
                  autoComplete="tel"
                />
              </label>
              <label className="checkout-label">
                Note for kitchen
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="input"
                  maxLength={500}
                />
              </label>
            </div>
            {error ? (
              <p
                className="checkout-error"
                role="alert"
                aria-live="assertive"
                style={{ color: "var(--red)", fontWeight: 700, marginTop: 14 }}
              >
                {error}
              </p>
            ) : null}
            <Btn
              variant="red"
              size="lg"
              block
              disabled={busy || items.length === 0}
              onClick={() => void startCheckout()}
              className={busy ? "opacity-70" : ""}
              style={{ marginTop: 16, minHeight: 52 }}
            >
              {busy ? "Creating order…" : "Continue to payment →"}
            </Btn>
          </>
        ) : session ? (
          <>
            <p style={{ fontWeight: 500, marginBottom: 14, opacity: 0.85, fontSize: "0.9rem" }}>
              Order {session.orderPublicId}
              {session.environment === "sandbox" ? " · sandbox" : ""}
            </p>
            <CloverCardForm
              pakmsKey={session.pakmsKey}
              sdkUrl={session.checkoutSdkUrl}
              onReady={onCardReady}
            />
            {error ? (
              <p
                className="checkout-error"
                role="alert"
                aria-live="assertive"
                style={{ color: "var(--red)", fontWeight: 700, marginTop: 14 }}
              >
                {error}
              </p>
            ) : null}
            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <Btn
                variant="red"
                size="lg"
                block
                disabled={busy}
                onClick={() => void pay()}
                style={{ minHeight: 52 }}
              >
                {busy ? "Processing…" : `Pay ${money(session.total)}`}
              </Btn>
              <Btn
                variant="cream"
                onClick={() => {
                  setStep("review");
                  setSession(null);
                  setTokenize(null);
                  setError(null);
                }}
              >
                ← Back to contact
              </Btn>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
