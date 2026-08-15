"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { appEvent, coinRate, eventPayout } from "@/db/schema";
import { currentUserId } from "@/lib/services/session-service";

const PATH = "/dashboard/settings/wallet";

const payoutSchema = z.object({
  eventType: z.enum(appEvent.enumValues),
  enabled: z.boolean(),
  coins: z.number().int().min(0),
});

// Every app_event row is a candidate the page synthesizes even when the table
// hasn't been touched yet (no seed step ships this list pre-populated), so
// this must upsert — a plain UPDATE would silently no-op on a first save.
export async function savePayoutRow(input: unknown): Promise<void> {
  await requireAdmin();
  const data = payoutSchema.parse(input);
  const userId = await currentUserId();
  await db
    .insert(eventPayout)
    .values({ eventType: data.eventType, enabled: data.enabled, coins: data.coins, createdBy: userId, updatedBy: userId })
    .onConflictDoUpdate({
      target: eventPayout.eventType,
      set: { enabled: data.enabled, coins: data.coins, updatedBy: userId },
    });
  revalidatePath(PATH);
}

const coinRateSchema = z.object({
  valuePerCoin: z.number().positive(),
});

// Append-only: every save is an INSERT, never an UPDATE. walletService reads
// the latest row by created_at, so history is preserved automatically.
export async function saveCoinRate(input: unknown): Promise<void> {
  await requireAdmin();
  const data = coinRateSchema.parse(input);
  const userId = await currentUserId();
  await db.insert(coinRate).values({
    currency: "CAD",
    valuePerCoin: data.valuePerCoin.toFixed(4),
    createdBy: userId,
  });
  revalidatePath(PATH);
}
