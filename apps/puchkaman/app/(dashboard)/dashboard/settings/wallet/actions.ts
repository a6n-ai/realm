"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ValidationError } from "@realm/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { coinRate, eventPayout } from "@/db/schema";
import { AWARDABLE_EVENTS } from "@/lib/services/wallet.service";
import { currentUserId } from "@/lib/services/session-service";

const PATH = "/dashboard/settings/wallet";

// Not `appEvent.enumValues`: app_event is the notification catalog, and only
// the events in AWARDABLE_EVENTS have an award call site. A switch for any
// other event would save happily and never pay out.
const payoutSchema = z.object({
  eventType: z.enum(AWARDABLE_EVENTS),
  enabled: z.boolean(),
  coins: z.number().int().min(0),
});

async function coinRateExists(): Promise<boolean> {
  const [row] = await db.select({ id: coinRate.id }).from(coinRate).limit(1);
  return Boolean(row);
}

// Every awardable event is a candidate the page synthesizes even when the table
// hasn't been touched yet (no seed step ships this list pre-populated), so
// this must upsert — a plain UPDATE would silently no-op on a first save.
export async function savePayoutRow(input: unknown): Promise<void> {
  await requireAdmin();
  const data = payoutSchema.parse(input);

  // Earning without a rate is a trap: customers accrue coins, the redeem
  // control appears, and checkout then 400s with a raw "No coin rate for CAD"
  // while the preview's matching 400 is swallowed. Refuse at the source.
  if (data.enabled && data.coins > 0 && !(await coinRateExists())) {
    throw new ValidationError(
      "Save a coin rate first — customers cannot spend coins until one exists.",
    );
  }

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
