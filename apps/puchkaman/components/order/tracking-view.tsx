"use client";

import type { TrackedOrder } from "@realm/order-tracking";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Btn, Pill } from "@/components/brutal/shared";
import { CloverCardForm } from "@/components/order/clover-card-form";
import {
  addNote,
  getPaymentConfig,
  requestCancel,
} from "@/app/(marketing)/track/[publicId]/actions";
import { money } from "@/lib/cart/types";
import { PHONE_DISPLAY, PHONE_TEL } from "@/lib/links";

/**
 * Status arrives from Clover webhooks, so the page just re-reads the server
 * every 20s. SSE would need the in-memory bus to be told about a change that
 * happens in a webhook handler; a poll picks it up for free, and stops as soon
 * as the order can no longer change.
 */
const POLL_MS = 20_000;

export function TrackingView({ order }: { order: TrackedOrder }) {
  const router = useRouter();

  useEffect(() => {
    if (order.terminal) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [order.terminal, router]);

  return (
    <section className="surface-cream" style={{ background: "var(--cream)" }}>
      <div className="wrap" style={{ padding: "40px 20px 72px", display: "grid", gap: 28 }}>
        <Timeline order={order} />
        <Items order={order} />
        {order.actions.includes("pay_balance") && <PayBalance order={order} />}
        <CustomerRequests order={order} />
      </div>
    </section>
  );
}

function Timeline({ order }: { order: TrackedOrder }) {
  return (
    <Card title="Progress">
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 14 }}>
        {order.steps.map((step) => (
          <li key={step.key} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
            <span aria-hidden style={{ fontSize: "1.1rem" }}>
              {step.state === "done" ? "●" : step.state === "current" ? "◐" : step.state === "failed" ? "✕" : "○"}
            </span>
            <span style={{ flex: 1 }}>
              <strong style={{ opacity: step.state === "upcoming" ? 0.5 : 1 }}>{step.label}</strong>
              {step.detail && <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>{step.detail}</div>}
            </span>
            {step.at && (
              <time className="mono" style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                {new Date(step.at).toLocaleString("en-CA", { timeZone: "America/Toronto" })}
              </time>
            )}
          </li>
        ))}
      </ol>
      <p style={{ marginTop: 18, fontSize: "0.9rem" }}>
        {order.fulfillment.summary}
        {order.fulfillment.address ? ` · ${order.fulfillment.address}` : ""}
      </p>
      <div style={{ marginTop: 14 }}>
        <Btn href={`tel:${PHONE_TEL}`} variant="white" size="sm">
          Call the shop · {PHONE_DISPLAY}
        </Btn>
      </div>
    </Card>
  );
}

function Items({ order }: { order: TrackedOrder }) {
  const { totals } = order;
  return (
    <Card title="Your order">
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {order.lines.map((line, i) => (
          <li key={`${line.name}-${i}`} style={{ display: "flex", gap: 12 }}>
            <span className="mono">{line.quantity}×</span>
            <span style={{ flex: 1 }}>
              {line.name}
              {line.modifiers?.length ? (
                <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>{line.modifiers.join(", ")}</div>
              ) : null}
            </span>
            <span className="mono">{money(line.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <dl style={{ marginTop: 18, display: "grid", gap: 6 }}>
        <Row label="Subtotal" value={money(totals.subtotal)} />
        {totals.discount ? <Row label="Discount" value={`−${money(totals.discount)}`} /> : null}
        <Row label="Tax" value={money(totals.tax)} />
        <Row label="Total" value={money(totals.total)} strong />
        {totals.balanceDue > 0 && <Row label="Balance due" value={money(totals.balanceDue)} strong />}
      </dl>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: strong ? 700 : 400 }}>
      <dt>{label}</dt>
      <dd className="mono" style={{ margin: 0 }}>
        {value}
      </dd>
    </div>
  );
}

function PayBalance({ order }: { order: TrackedOrder }) {
  const router = useRouter();
  const [config, setConfig] = useState<{ pakmsKey: string; sdkUrl: string } | null>(null);
  const [tokenize, setTokenize] = useState<(() => Promise<string>) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Fetching the payment config is a server round trip that used to happen in
  // silence — the button sat there looking unpressed, and a second press fired
  // a second request.
  const [starting, setStarting] = useState(false);

  async function start() {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const res = await getPaymentConfig(order.reference);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfig({ pakmsKey: res.pakmsKey, sdkUrl: res.sdkUrl });
    } finally {
      setStarting(false);
    }
  }

  async function pay() {
    if (!tokenize || busy) return;
    setBusy(true);
    setError(null);
    try {
      const source = await tokenize();
      // Amount is deliberately absent: the server charges the Clover order
      // total, so a tampered client cannot decide what it pays.
      const res = await fetch("/api/checkout/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderPublicId: order.reference, source }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        setError(body?.detail ?? "Payment failed. Your card was not charged.");
        return;
      }
      router.refresh();
    } catch {
      setError("Payment failed. Your card was not charged.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Pay your balance">
      <p style={{ marginBottom: 14 }}>
        <Pill>{money(order.totals.balanceDue)} outstanding</Pill>
      </p>
      {!config ? (
        <Btn variant="ink" onClick={start} disabled={starting}>
          <span className="label-swap" key={starting ? "busy" : "idle"}>
            {starting ? "Opening card form…" : "Pay by card"}
          </span>
        </Btn>
      ) : (
        <>
          <CloverCardForm pakmsKey={config.pakmsKey} sdkUrl={config.sdkUrl} onReady={(t) => setTokenize(() => t)} />
          <div style={{ marginTop: 14 }}>
            <Btn variant="ink" onClick={pay} disabled={busy || !tokenize} block>
              <span className="label-swap" key={busy ? "busy" : "idle"}>
                {busy ? "Charging…" : `Pay ${money(order.totals.balanceDue)}`}
              </span>
            </Btn>
          </div>
        </>
      )}
      {error && (
        <p className="form-error" role="alert" aria-live="assertive" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
    </Card>
  );
}

function CustomerRequests({ order }: { order: TrackedOrder }) {
  const canNote = order.actions.includes("add_note");
  const canCancel = order.actions.includes("request_cancel");
  if (!canNote && !canCancel) return null;

  return (
    <Card title="Need to change something?">
      {canNote && <RequestForm orderId={order.reference} kind="note" />}
      {canCancel && <RequestForm orderId={order.reference} kind="cancel" />}
    </Card>
  );
}

function RequestForm({ orderId, kind }: { orderId: string; kind: "note" | "cancel" }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    setError(null);
    const res = kind === "note" ? await addNote(orderId, text) : await requestCancel(orderId, text);
    if (!res.ok) {
      setError(res.error);
      setStatus("error");
      return;
    }
    setText("");
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <p className="track-sent" role="status" style={{ marginBottom: 18 }}>
        {kind === "note"
          ? "Sent — the kitchen will see your note."
          : "Cancellation requested. We'll call you to confirm; the order is not cancelled until we do."}
      </p>
    );
  }

  return (
    <form onSubmit={submit} style={{ marginBottom: 22 }}>
      <label className="mono" htmlFor={`req-${kind}`} style={{ fontSize: "0.8rem" }}>
        {kind === "note" ? "Add a note for the kitchen" : "Request a cancellation"}
      </label>
      <textarea
        id={`req-${kind}`}
        value={text}
        maxLength={500}
        rows={3}
        required={kind === "note"}
        onChange={(e) => setText(e.target.value)}
        placeholder={kind === "note" ? "Leave it at the door…" : "Reason (optional)"}
        className="textarea"
        style={{ width: "100%", margin: "8px 0 12px" }}
      />
      <Btn type="submit" variant={kind === "note" ? "white" : "yellow"} size="sm" disabled={status === "busy"}>
        <span className="label-swap" key={status === "busy" ? "busy" : "idle"}>
          {status === "busy" ? "Sending…" : kind === "note" ? "Send note" : "Request cancellation"}
        </span>
      </Btn>
      {error && (
        <p className="form-error" role="alert" aria-live="assertive" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </form>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "var(--border)", background: "var(--white)", padding: "22px 20px" }}>
      <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: "1.1rem" }}>{title}</h2>
      {children}
    </div>
  );
}
