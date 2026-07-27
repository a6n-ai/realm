"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Btn, Pill } from "@/components/brutal/shared";
import { CloverCardForm } from "@/components/order/clover-card-form";

type CatalogItem = {
  publicId: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  cloverItemId: string;
  stockQty: number | null;
};

type CartLine = { productPublicId: string; quantity: number };

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

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export function PickupOrderClient() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"menu" | "checkout" | "pay" | "done">("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [tokenize, setTokenize] = useState<(() => Promise<string>) | null>(null);
  const [paidTotal, setPaidTotal] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/checkout/catalog");
        const data = (await res.json().catch(() => null)) as
          | { items?: CatalogItem[]; detail?: string; title?: string }
          | null;
        if (!res.ok) {
          setLoadError(data?.detail ?? data?.title ?? "Could not load menu");
          return;
        }
        setCatalog(data?.items ?? []);
      } catch {
        setLoadError("Could not load menu");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const lines: CartLine[] = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([productPublicId, quantity]) => ({ productPublicId, quantity })),
    [cart],
  );

  const subtotal = useMemo(() => {
    let s = 0;
    for (const line of lines) {
      const item = catalog.find((c) => c.publicId === line.productPublicId);
      if (item) s += item.price * line.quantity;
    }
    return Math.round(s * 100) / 100;
  }, [lines, catalog]);

  const setQty = (id: string, qty: number) => {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  };

  const onCardReady = useCallback((fn: () => Promise<string>) => {
    setTokenize(() => fn);
  }, []);

  async function startCheckout() {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one item");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: lines,
          contact: { name, email, phone: phone || null, note: note || null },
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
        status?: string;
      } | null;
      if (!res.ok) {
        setError(data?.detail ?? "Payment failed");
        return;
      }
      setPaidTotal(data?.total ?? session.total);
      setStep("done");
      setCart({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p style={{ fontWeight: 600 }}>Loading orderable menu…</p>;
  }

  if (loadError) {
    return (
      <div className="card card--cream" style={{ padding: 24 }}>
        <h3 className="display" style={{ fontSize: "1.4rem", marginBottom: 8 }}>
          Pickup orders unavailable
        </h3>
        <p style={{ fontWeight: 500 }}>{loadError}</p>
        <p style={{ marginTop: 12, opacity: 0.8, fontWeight: 500 }}>
          Connect Clover and sync inventory, then link products with stock.
        </p>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="card card--green surface-green" style={{ color: "#fff", padding: 28 }}>
        <Pill variant="yellow">PAID</Pill>
        <h2 className="display" style={{ fontSize: "2rem", margin: "12px 0" }}>
          Order locked in
        </h2>
        <p style={{ fontWeight: 500, maxWidth: 420 }}>
          Thanks{name ? `, ${name}` : ""} — we charged {money(paidTotal ?? 0)} and sent the order to
          the kitchen POS. Ready in about 15 minutes at 3315 Danforth Ave.
        </p>
        <div style={{ marginTop: 20 }}>
          <Btn
            variant="yellow"
            onClick={() => {
              setStep("menu");
              setSession(null);
              setPaidTotal(null);
              setError(null);
            }}
          >
            Order again
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 22 }}>
      {catalog.length === 0 ? (
        <div className="card card--cream" style={{ padding: 22 }}>
          <p style={{ fontWeight: 600 }}>
            No Clover-linked in-stock products yet. Sync inventory in admin, then come back.
          </p>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {catalog.map((item) => {
            const qty = cart[item.publicId] ?? 0;
            return (
              <div key={item.publicId} className="card" style={{ padding: 16, background: "var(--white)" }}>
                <div className="flex center between" style={{ marginBottom: 8 }}>
                  <Pill variant="ink">{item.category}</Pill>
                  <strong>{money(item.price)}</strong>
                </div>
                <h3 style={{ fontSize: "1.15rem", marginBottom: 6 }}>{item.name}</h3>
                {item.description ? (
                  <p style={{ fontSize: "0.88rem", opacity: 0.8, marginBottom: 12, fontWeight: 500 }}>
                    {item.description.slice(0, 100)}
                    {item.description.length > 100 ? "…" : ""}
                  </p>
                ) : null}
                <div className="flex center between">
                  <Btn variant="cream" size="sm" onClick={() => setQty(item.publicId, Math.max(0, qty - 1))}>
                    −
                  </Btn>
                  <span style={{ fontWeight: 800, minWidth: 28, textAlign: "center" }}>{qty}</span>
                  <Btn variant="ink" size="sm" onClick={() => setQty(item.publicId, qty + 1)}>
                    +
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card card--cream" style={{ padding: 22 }}>
        <div className="flex center between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <h3 className="display" style={{ fontSize: "1.35rem" }}>
            {step === "pay" ? "Pay with card" : "Your pickup"}
          </h3>
          <strong style={{ fontSize: "1.2rem" }}>{money(session?.total ?? subtotal)}</strong>
        </div>

        {step !== "pay" ? (
          <>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                Name *
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="card"
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 10, border: "none" }}
                />
              </label>
              <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                Email *
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="card"
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 10, border: "none" }}
                />
              </label>
              <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                Phone
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="card"
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 10, border: "none" }}
                />
              </label>
              <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                Note
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="card"
                  style={{ display: "block", width: "100%", marginTop: 6, padding: 10, border: "none" }}
                />
              </label>
            </div>
            <Btn variant="green" size="lg" block onClick={() => void startCheckout()} className={busy ? "opacity-70" : ""}>
              {busy ? "Creating order…" : "Continue to payment →"}
            </Btn>
          </>
        ) : session ? (
          <>
            <p style={{ fontWeight: 500, marginBottom: 14, opacity: 0.85 }}>
              Order {session.orderPublicId} · Clover {session.cloverOrderId}
              {session.environment === "sandbox" ? " · sandbox" : ""}
            </p>
            <CloverCardForm
              pakmsKey={session.pakmsKey}
              sdkUrl={session.checkoutSdkUrl}
              onReady={onCardReady}
            />
            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <Btn variant="green" size="lg" block onClick={() => void pay()} className={busy ? "opacity-70" : ""}>
                {busy ? "Processing…" : `Pay ${money(session.total)}`}
              </Btn>
              <Btn
                variant="cream"
                onClick={() => {
                  setStep("menu");
                  setSession(null);
                  setTokenize(null);
                }}
              >
                ← Back
              </Btn>
            </div>
          </>
        ) : null}

        {error ? (
          <p style={{ color: "var(--red)", fontWeight: 700, marginTop: 14 }}>{error}</p>
        ) : null}
      </div>
    </div>
  );
}
