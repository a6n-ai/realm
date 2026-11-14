"use server";

import { z } from "zod";
import { parseInput, staffAction } from "@/lib/actions/staff-action";
import type { ActionResult } from "@/lib/actions/action-result";
import { saveCoinRate as saveCoinRateValue } from "@/lib/wallet/wallet-balances.service";
import { setCoinEarnPct, setMaxCoinPctOfSubtotal, setMaxCoinRedeemPctOfBalance, setMaxWalletBalance } from "@/lib/wallet/wallet-settings";

const WALLET = { guard: "admin", revalidate: [["/dashboard/wallet", "layout"]] } as const;

const coinRateSchema = z.object({
  currency: z.string().trim().min(1).max(10),
  valuePerCoin: z.number().positive(),
});

export async function saveCoinRate(input: unknown): Promise<ActionResult> {
  return staffAction(WALLET, async () => {
    const { currency, valuePerCoin } = parseInput(coinRateSchema, input);
    await saveCoinRateValue(currency, valuePerCoin);
  });
}

const walletCapSchema = z.object({
  maxWalletBalance: z.number().int().positive().nullable(),
});

export async function setWalletCapAction(input: unknown): Promise<ActionResult> {
  return staffAction(WALLET, async () => {
    await setMaxWalletBalance(parseInput(walletCapSchema, input).maxWalletBalance);
  });
}

const earnPctSchema = z.object({ pct: z.number().min(0).max(100) });

export async function setCoinEarnPctAction(input: unknown): Promise<ActionResult> {
  return staffAction(WALLET, async () => {
    await setCoinEarnPct(parseInput(earnPctSchema, input).pct);
  });
}

const coinCapSchema = z.object({
  maxCoinPct: z.number().int().min(0).max(100).nullable(),
});

export async function setCoinCapAction(input: unknown): Promise<ActionResult> {
  return staffAction(WALLET, async () => {
    await setMaxCoinPctOfSubtotal(parseInput(coinCapSchema, input).maxCoinPct);
  });
}

const walletRedeemCapSchema = z.object({
  maxCoinRedeemPctOfBalance: z.number().int().min(0).max(100).nullable(),
});

export async function setWalletRedeemCapAction(input: unknown): Promise<ActionResult> {
  return staffAction(WALLET, async () => {
    await setMaxCoinRedeemPctOfBalance(parseInput(walletRedeemCapSchema, input).maxCoinRedeemPctOfBalance);
  });
}
