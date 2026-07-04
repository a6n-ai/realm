"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { coinRate, eventPayout } from "@/db/schema";
import { appEvent } from "@/db/schema/wallet";

const PATH = "/dashboard/wallet";

const payoutSchema = z.object({
  eventType: z.enum(appEvent.enumValues),
  enabled: z.boolean(),
  coins: z.number().int().min(0),
});

export async function savePayoutRow(input: unknown) {
  await requireAdmin();
  const data = payoutSchema.parse(input);
  await db
    .update(eventPayout)
    .set({ enabled: data.enabled, coins: data.coins })
    .where(eq(eventPayout.eventType, data.eventType));
  revalidatePath(PATH, "layout");
}

const coinRateSchema = z.object({
  currency: z.string().trim().min(1).max(10),
  valuePerCoin: z.number().positive(),
});

export async function saveCoinRate(input: unknown) {
  await requireAdmin();
  const data = coinRateSchema.parse(input);
  await db.insert(coinRate).values({
    currency: data.currency,
    valuePerCoin: data.valuePerCoin.toFixed(4),
  });
  revalidatePath(PATH, "layout");
}
