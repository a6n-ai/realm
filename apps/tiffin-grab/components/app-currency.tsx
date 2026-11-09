"use client";

import { formatMoney } from "@/lib/format/money";
import { createContext, useContext, type ReactNode } from "react";

const AppCurrencyContext = createContext<string | null>(null);

export const AppCurrencyProvider = ({ currency, children }: { currency: string; children: ReactNode }) => (
  <AppCurrencyContext.Provider value={currency}>{children}</AppCurrencyContext.Provider>
);

export function useAppCurrency(): string {
  const currency = useContext(AppCurrencyContext);
  if (!currency) throw new Error("useAppCurrency needs an AppCurrencyProvider");
  return currency;
}

export function useFormatMoney(opts?: { whole?: boolean; narrow?: boolean }) {
  const currency = useAppCurrency();
  return (amount: number) => formatMoney(amount, currency, opts);
}
