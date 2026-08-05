"use client";

import { useEffect, useMemo, useState } from "react";
import type { CartItem } from "./types";

export type CartQuote = {
  subtotal: number;
  tax: number;
  total: number;
  taxLines: { name: string; amount: number }[];
};

/** Everything the price depends on, so a quote can be matched to the bag it priced. */
function bagKey(items: CartItem[]): string {
  return items
    .map((i) => `${i.productPublicId}:${i.quantity}:${i.modifiers.map((m) => m.cloverModifierId).join("+")}`)
    .join("|");
}

/**
 * Server-priced bag total, including tax from the mirrored Clover rates.
 *
 * Debounced because it fires on every quantity tap, and aborted on change so a
 * slow earlier response can't overwrite a newer one. The result is stored with
 * the bag it priced and only returned while that bag still matches, so a stale
 * total can never be shown against different items. Returns null until the first
 * quote lands — callers fall back to the client-side subtotal, which has no tax.
 */
export function useCartQuote(items: CartItem[], enabled = true): CartQuote | null {
  const [priced, setPriced] = useState<{ key: string; quote: CartQuote } | null>(null);
  const key = useMemo(() => bagKey(items), [items]);
  // Once Clover has priced a real order there is nothing left to forecast.
  const active = enabled && items.length > 0;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/checkout/quote", {
            method: "POST",
            headers: { "content-type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              items: items.map((i) => ({
                productPublicId: i.productPublicId,
                quantity: i.quantity,
                modifiers: i.modifiers.map((m) => m.cloverModifierId),
              })),
            }),
          });
          // A stale or unavailable product 400s here. Stay on the estimate —
          // checkout is where that has to become a hard error.
          if (!res.ok) return;
          setPriced({ key, quote: (await res.json()) as CartQuote });
        } catch {
          /* aborted or offline — keep whatever we last showed */
        }
      })();
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [items, key, active]);

  return active && priced?.key === key ? priced.quote : null;
}
