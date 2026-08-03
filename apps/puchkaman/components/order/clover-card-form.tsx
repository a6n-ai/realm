"use client";

import { useEffect, useRef, useState } from "react";

type CloverElementsLike = {
  create: (type: string, opts?: Record<string, unknown>) => {
    mount: (el: string | HTMLElement) => void;
    destroy?: () => void;
  };
};

type CloverSdk = {
  elements: () => CloverElementsLike;
  createToken: () => Promise<{ token?: string; errors?: Record<string, { error?: string }> }>;
};

declare global {
  interface Window {
    Clover?: new (pakmsKey: string, opts?: { locale?: string }) => CloverSdk;
  }
}

// Cached per src so concurrent mounts (React Strict Mode's double-invoke in
// dev, or two CloverCardForm instances) await the *same* load rather than
// each independently finding the other's <script> tag already in the DOM
// and resolving immediately — before it has actually finished loading and
// defined window.Clover.
const scriptLoads = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const cached = scriptLoads.get(src);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (window.Clover) {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new Error("Failed to load Clover checkout SDK")),
        );
      }
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Clover checkout SDK"));
    document.head.appendChild(s);
  });

  scriptLoads.set(src, promise);
  return promise;
}

/**
 * Embeds Clover hosted iframe card fields and exposes tokenize via ref callback.
 * Styles stay minimal so the brutalist checkout page owns the chrome.
 */
export function CloverCardForm({
  pakmsKey,
  sdkUrl,
  onReady,
}: {
  pakmsKey: string;
  sdkUrl: string;
  onReady: (tokenize: () => Promise<string>) => void;
}) {
  const mounted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let destroyed = false;
    const cardEls: { destroy?: () => void }[] = [];

    void (async () => {
      try {
        setError(null);
        await loadScript(sdkUrl);
        if (destroyed) return;
        if (!window.Clover) {
          setError("Clover payment form unavailable");
          return;
        }
        const clover = new window.Clover(pakmsKey, { locale: "en-US" });
        const elements = clover.elements();
        const styles = {
          body: { fontFamily: "inherit" },
          input: { fontSize: "16px", color: "#111" },
        };
        const cardNumber = elements.create("CARD_NUMBER", { styles });
        const cardDate = elements.create("CARD_DATE", { styles });
        const cardCvv = elements.create("CARD_CVV", { styles });
        const cardPostal = elements.create("CARD_POSTAL_CODE", { styles });
        cardNumber.mount("#clover-card-number");
        cardDate.mount("#clover-card-date");
        cardCvv.mount("#clover-card-cvv");
        cardPostal.mount("#clover-card-postal");
        cardEls.push(cardNumber, cardDate, cardCvv, cardPostal);
        mounted.current = true;
        onReady(async () => {
          const result = await clover.createToken();
          if (result.errors) {
            const first = Object.values(result.errors)[0];
            throw new Error(first?.error ?? "Card validation failed");
          }
          if (!result.token) throw new Error("No card token returned");
          return result.token;
        });
      } catch (e) {
        if (!destroyed) setError(e instanceof Error ? e.message : "Payment form error");
      }
    })();

    return () => {
      destroyed = true;
      for (const el of cardEls) el.destroy?.();
    };
  }, [pakmsKey, sdkUrl, onReady]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error ? (
        <p style={{ color: "var(--red)", fontWeight: 600 }}>{error}</p>
      ) : null}
      <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
        Card number
        <div
          id="clover-card-number"
          className="card"
          style={{ marginTop: 6, padding: 12, minHeight: 44, background: "var(--white)" }}
        />
      </label>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
          Exp
          <div
            id="clover-card-date"
            className="card"
            style={{ marginTop: 6, padding: 12, minHeight: 44, background: "var(--white)" }}
          />
        </label>
        <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
          CVV
          <div
            id="clover-card-cvv"
            className="card"
            style={{ marginTop: 6, padding: 12, minHeight: 44, background: "var(--white)" }}
          />
        </label>
        <label style={{ fontWeight: 700, fontSize: "0.85rem" }}>
          Postal
          <div
            id="clover-card-postal"
            className="card"
            style={{ marginTop: 6, padding: 12, minHeight: 44, background: "var(--white)" }}
          />
        </label>
      </div>
    </div>
  );
}
