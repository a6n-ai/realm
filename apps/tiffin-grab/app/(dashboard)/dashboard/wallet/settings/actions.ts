"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import {
  setCoinEarnPct,
  setMaxCoinPctOfSubtotal,
  setMaxCoinRedeemPctOfBalance,
  setMaxWalletBalance,
  setReferralSettings,
} from "@/lib/services/app-settings.service";

const PATH = "/dashboard/wallet";

const walletCapSchema = z.object({
  maxWalletBalance: z.number().int().positive().nullable(),
});

export async function setWalletCapAction(input: unknown): Promise<void> {
  await requireAdmin();
  const data = walletCapSchema.parse(input);
  await setMaxWalletBalance(data.maxWalletBalance);
  revalidatePath(PATH, "layout");
}

const earnPctSchema = z.object({ pct: z.number().int().min(0).max(100) });

export async function setCoinEarnPctAction(input: unknown): Promise<void> {
  await requireAdmin();
  const { pct } = earnPctSchema.parse(input);
  await setCoinEarnPct(pct);
  revalidatePath(PATH, "layout");
}

// Validated again in the service; this is the admin gate.
export async function setReferralSettingsAction(input: unknown): Promise<void> {
  await requireAdmin();
  await setReferralSettings(input);
  revalidatePath(PATH, "layout");
}

const coinCapSchema = z.object({
  maxCoinPct: z.number().int().min(0).max(100).nullable(),
});

export async function setCoinCapAction(input: unknown): Promise<void> {
  await requireAdmin();
  const { maxCoinPct } = coinCapSchema.parse(input);
  await setMaxCoinPctOfSubtotal(maxCoinPct);
  revalidatePath(PATH, "layout");
}

const walletRedeemCapSchema = z.object({
  maxCoinRedeemPctOfBalance: z.number().int().min(0).max(100).nullable(),
});

export async function setWalletRedeemCapAction(input: unknown): Promise<void> {
  await requireAdmin();
  const { maxCoinRedeemPctOfBalance } = walletRedeemCapSchema.parse(input);
  await setMaxCoinRedeemPctOfBalance(maxCoinRedeemPctOfBalance);
  revalidatePath(PATH, "layout");
}
