"use server";

import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { coinRate, users } from "@/db/schema";
import { currentUserId } from "@/lib/services/session-service";
import { awardCustomerBroadcast } from "@/lib/services/customer-payouts.service";

const PATH = "/dashboard/wallet";

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

// ---------- Customer Payouts: one-off bulk broadcast ----------

const broadcastSchema = z.object({
  userPublicIds: z.array(z.string().trim().min(1)).min(1),
  coins: z.number().int().min(0),
  memo: z.string().trim().max(200).optional(),
});

export type CustomerBroadcastResult = { awarded: number; coinsPerCustomer: number; capped: number };

export async function broadcastCustomerPayout(input: unknown): Promise<CustomerBroadcastResult> {
  await requireAdmin();
  const data = broadcastSchema.parse(input);
  const rows = await db.select({ id: users.id }).from(users).where(inArray(users.publicId, data.userPublicIds));
  const result = await awardCustomerBroadcast(rows.map((r) => r.id), data.coins, data.memo, await currentUserId());
  revalidatePath(PATH, "layout");
  return result;
}
