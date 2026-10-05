"use client";

import { useEffect } from "react";
import { useCartQuote } from "@/lib/cart/use-cart-quote";
import { useCart } from "./cart-provider";

/**
 * useCartQuote, plus writing the server's current line prices back into the
 * cart. Prices are saved in the browser when an item is added, so a bag filled
 * before an admin's Clover pull would otherwise keep showing old prices. The
 * charge was always correct (checkout re-prices server-side); this keeps what
 * the customer sees equal to it.
 */
export function useLiveCartQuote(...args: Parameters<typeof useCartQuote>) {
  const quote = useCartQuote(...args);
  const { applyLivePrices } = useCart();
  useEffect(() => {
    if (quote) applyLivePrices(quote.lines);
  }, [quote, applyLivePrices]);
  return quote;
}
