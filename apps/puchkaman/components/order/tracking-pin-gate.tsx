"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn, PageBanner } from "@/components/brutal/shared";
import { authClient } from "@/lib/auth/client";

/**
 * The PIN is the last 4 digits of the phone on the order. It is never sent to
 * the browser — the customer supplies it and the server compares. Verification
 * goes through the Better Auth plugin endpoint, so the grant cookie is signed
 * and rate-limited by Better Auth rather than by anything hand-rolled here.
 */
export function TrackingPinGate({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const { error: err } = await authClient.orderTracking.verify({ orderId, pin });
    setBusy(false);

    if (err) {
      setError(
        err.status === 429
          ? "Too many attempts. Try again in a few minutes."
          : "That PIN does not match this order.",
      );
      setPin("");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <PageBanner
        kicker="Order status"
        title="Enter your PIN"
        sub="The last 4 digits of the phone number on this order."
        crumb="Track order"
      />
      <section className="surface-cream" style={{ background: "var(--cream)" }}>
        <div className="wrap" style={{ padding: "48px 20px 64px", maxWidth: 460 }}>
          <form onSubmit={submit}>
            <label className="mono" htmlFor="tracking-pin" style={{ fontSize: "0.8rem" }}>
              PIN
            </label>
            <input
              id="tracking-pin"
              // Numeric keypad on mobile without the spinner and scroll-wheel
              // behaviour a number input drags in.
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "tracking-pin-error" : undefined}
              style={{
                width: "100%",
                border: "var(--border)",
                padding: "14px 16px",
                fontSize: "1.4rem",
                letterSpacing: "0.4em",
                margin: "8px 0 16px",
                background: "var(--white)",
              }}
            />
            {error && (
              <p id="tracking-pin-error" role="alert" style={{ color: "var(--red)", marginBottom: 16 }}>
                {error}
              </p>
            )}
            <Btn type="submit" variant="ink" block disabled={busy || pin.length < 4}>
              {busy ? "Checking…" : "View my order"}
            </Btn>
          </form>
        </div>
      </section>
    </>
  );
}
