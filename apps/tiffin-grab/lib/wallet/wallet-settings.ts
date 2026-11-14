import { ValidationError } from "@foundry/commons";
import { settingsCache, saveSetting } from "@/lib/settings";
import { db } from "@/db/client";
import { app } from "@/db/schema";

// NULL = unlimited. Read on every award, so it's cached like the other settings.
export async function getMaxWalletBalance(): Promise<number | null> {
  return settingsCache.getOrSet("maxWalletBalance", async () => {
    const [row] = await db.select({ v: app.maxWalletBalance }).from(app).limit(1);
    return row?.v ?? null;
  });
}

export async function setMaxWalletBalance(cap: number | null): Promise<void> {
  await saveSetting({ maxWalletBalance: cap });
}

/**
 * Ceiling on the share of an order's PRE-TAX SUBTOTAL that coins may cover.
 * NULL = unlimited (coins bounded only by the order's remaining balance).
 * Read on the checkout path, so cached like the rest.
 */
export async function getMaxCoinRedeemPctOfBalance(): Promise<number | null> {
  return settingsCache.getOrSet("maxCoinRedeemPctOfBalance", async () => {
    const [row] = await db.select({ v: app.maxCoinRedeemPctOfBalance }).from(app).limit(1);
    return row?.v ?? null;
  });
}

export async function getMaxCoinPctOfSubtotal(): Promise<number | null> {
  return settingsCache.getOrSet("maxCoinPctOfSubtotal", async () => {
    const [row] = await db.select({ v: app.maxCoinPctOfSubtotal }).from(app).limit(1);
    return row?.v ?? null;
  });
}

export async function setMaxCoinPctOfSubtotal(pct: number | null): Promise<void> {
  if (pct != null && (!Number.isInteger(pct) || pct < 0 || pct > 100)) {
    throw new ValidationError("Coin limit must be a whole percent between 0 and 100");
  }
  await saveSetting({ maxCoinPctOfSubtotal: pct });
}

/** Percent (up to 2 decimals) of a paid order's pre-tax amount earned back as coins. 0 = off. */
export async function getCoinEarnPct(): Promise<number> {
  return settingsCache.getOrSet("coinEarnPct", async () => {
    const [row] = await db.select({ v: app.coinEarnPct }).from(app).limit(1);
    return row?.v ?? 0;
  });
}

export async function setCoinEarnPct(pct: number): Promise<void> {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100 || Math.abs(pct * 100 - Math.round(pct * 100)) > 1e-6) {
    throw new ValidationError("Earn rate must be a percent between 0 and 100 with at most 2 decimals");
  }
  await saveSetting({ coinEarnPct: pct });
}

export async function setMaxCoinRedeemPctOfBalance(pct: number | null): Promise<void> {
  await saveSetting({ maxCoinRedeemPctOfBalance: pct });
}
