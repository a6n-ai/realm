"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { setMaxCoinPctOfSubtotal, setProvinceTaxes } from "@/lib/services/app-settings.service";
import { PROVINCES } from "@/lib/tax/canada";

const PATH = "/dashboard/settings/payments/checkout-rules";

const coinCapSchema = z.object({
  maxCoinPct: z.number().int().min(0).max(100).nullable(),
});

export async function setCoinCapAction(input: unknown): Promise<void> {
  await requireAdmin();
  const { maxCoinPct } = coinCapSchema.parse(input);
  await setMaxCoinPctOfSubtotal(maxCoinPct);
  revalidatePath(PATH);
}

const taxLineSchema = z.object({
  name: z.string().trim().min(1).max(20),
  ratePct: z.number().min(0).max(100),
});
// Keyed only by known province codes, so a crafted request can't park rates
// under a key checkout would never read (or would misread).
const provinceTaxesSchema = z.record(z.enum(PROVINCES), z.array(taxLineSchema).max(4));

export async function setProvinceTaxesAction(input: unknown): Promise<void> {
  await requireAdmin();
  const taxes = provinceTaxesSchema.parse(input);
  await setProvinceTaxes(taxes);
  revalidatePath(PATH);
}
