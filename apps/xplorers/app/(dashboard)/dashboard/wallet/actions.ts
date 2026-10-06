"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { coinRate, eventPayout, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";
import { setMaxWalletBalance } from "@/lib/services/app-settings.service";
import { currentUserId } from "@/lib/services/session-service";
import { PAYOUT_EVENTS, walletService } from "@/lib/services/wallet.service";

const PATH = "/dashboard/wallet";

async function familyId(publicId: string): Promise<bigint> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  if (!row) throw new ValidationError("Family not found.");
  return row.id;
}

export async function savePayoutAction(input: { event: string; enabled: boolean; coins: number }): Promise<void> {
  await requirePermission({ wallet: ["update"] });
  const event = PAYOUT_EVENTS.find((e) => e === input.event);
  if (!event) throw new ValidationError("Unknown payout event.");
  if (!Number.isInteger(input.coins) || input.coins < 0) throw new ValidationError("Coins must be a whole number of 0 or more.");
  await db
    .update(eventPayout)
    .set({ enabled: Boolean(input.enabled), coins: input.coins })
    .where(eq(eventPayout.eventType, event));
  revalidatePath(PATH, "layout");
}

export async function saveCoinRateAction(input: { currency: string; valuePerCoin: number }): Promise<void> {
  await requirePermission({ wallet: ["update"] });
  if (!Number.isFinite(input.valuePerCoin) || input.valuePerCoin <= 0) throw new ValidationError("Value per coin must be more than 0.");
  await db.insert(coinRate).values({ currency: input.currency, valuePerCoin: input.valuePerCoin.toFixed(4) });
  revalidatePath(PATH, "layout");
}

export async function saveWalletCapAction(input: { maxWalletBalance: number | null }): Promise<void> {
  await requirePermission({ wallet: ["update"] });
  await setMaxWalletBalance(input.maxWalletBalance);
  revalidatePath(PATH, "layout");
}

export async function adjustFamilyCoinsAction(
  familyPublicId: string,
  input: { coins: number; memo: string },
): Promise<{ error?: string }> {
  await requirePermission({ wallet: ["update"] });
  try {
    const userId = await familyId(familyPublicId);
    await walletService.adjust({ userId, coins: input.coins, memo: input.memo, actorId: await currentUserId() });
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(PATH, "layout");
  return {};
}

export async function familyBalanceAction(familyPublicId: string): Promise<number> {
  await requirePermission({ wallet: ["read"] });
  return walletService.balance(await familyId(familyPublicId));
}
