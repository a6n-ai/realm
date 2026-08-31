"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { ValidationError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { coinRate, durationPackages, eventPayout, mealPayout, mealSizes, users } from "@/db/schema";
import { appEvent } from "@/db/schema/wallet";
import { walletService } from "@/lib/services/wallet.service";
import { searchCustomers } from "@/lib/services/customers.service";
import {
  awardCustomerBroadcast,
  listOrderCities,
  listPayoutCandidates,
  type PayoutCandidate,
  type PayoutCandidateFilters,
} from "@/lib/services/customer-payouts.service";

const log = createLogger("wallet.actions");

export type MealPayoutAwardResult = { matched: number; awarded: number; coinsPerCustomer: number; capped: number };

// Award failures must never fail the save/add itself — same post-commit,
// try/catch-and-log pattern orders.service.ts already uses for order_activated
// awards. The rule change is real either way; the admin just sees a 0-award
// toast instead of a crash if this part fails.
async function awardAfterSave(ruleId: bigint): Promise<MealPayoutAwardResult> {
  try {
    return await walletService.awardMealPayoutRule(ruleId);
  } catch (e) {
    log.error({ err: e, ruleId: ruleId.toString() }, "meal payout award failed");
    return { matched: 0, awarded: 0, coinsPerCustomer: 0, capped: 0 };
  }
}

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

const saveMealPayoutSchema = z.object({
  id: z.string().trim().min(1),
  coins: z.number().int().min(0),
});

// Works for both the default row and any override row — only the coin count is ever
// editable after creation; to change WHICH combo a rule applies to, remove it and add
// a new one (same convention as Event Payouts never letting you rebind an event).
export async function saveMealPayoutRow(input: unknown): Promise<MealPayoutAwardResult> {
  await requireAdmin();
  const data = saveMealPayoutSchema.parse(input);
  const [row] = await db.select({ id: mealPayout.id }).from(mealPayout).where(eq(mealPayout.publicId, data.id)).limit(1);
  if (!row) throw new ValidationError("Payout rule not found");
  await db.update(mealPayout).set({ coins: data.coins }).where(eq(mealPayout.id, row.id));
  revalidatePath(PATH, "layout");
  return awardAfterSave(row.id);
}

const addMealPayoutOverrideSchema = z.object({
  mealSizePublicId: z.string().trim().min(1),
  durationPackagePublicId: z.string().trim().min(1),
  coins: z.number().int().min(0),
});

export async function addMealPayoutOverride(input: unknown): Promise<MealPayoutAwardResult> {
  await requireAdmin();
  const data = addMealPayoutOverrideSchema.parse(input);

  const [mealSize] = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.publicId, data.mealSizePublicId)).limit(1);
  if (!mealSize) throw new ValidationError("Meal size not found");
  const [duration] = await db.select({ id: durationPackages.id }).from(durationPackages).where(eq(durationPackages.publicId, data.durationPackagePublicId)).limit(1);
  if (!duration) throw new ValidationError("Duration package not found");

  const [existing] = await db
    .select({ id: mealPayout.id })
    .from(mealPayout)
    .where(and(eq(mealPayout.mealSizeId, mealSize.id), eq(mealPayout.durationPackageId, duration.id)))
    .limit(1);
  if (existing) throw new ValidationError("A rule for this meal size and duration already exists — edit it instead");

  const [created] = await db.insert(mealPayout).values({
    mealSizeId: mealSize.id,
    durationPackageId: duration.id,
    coins: data.coins,
  }).returning({ id: mealPayout.id });
  revalidatePath(PATH, "layout");
  return awardAfterSave(created.id);
}

const removeMealPayoutOverrideSchema = z.object({ id: z.string().trim().min(1) });

export async function removeMealPayoutOverride(input: unknown) {
  await requireAdmin();
  const data = removeMealPayoutOverrideSchema.parse(input);
  const [row] = await db.select().from(mealPayout).where(eq(mealPayout.publicId, data.id)).limit(1);
  if (!row) throw new ValidationError("Payout rule not found");
  // Defense in depth beyond just omitting the Remove button in the UI: the default
  // rule (both dimensions NULL) is never deletable.
  if (row.mealSizeId === null || row.durationPackageId === null) {
    throw new ValidationError("The default rule can't be removed");
  }
  await db.delete(mealPayout).where(eq(mealPayout.id, row.id));
  revalidatePath(PATH, "layout");
}

// ---------- Customer Payouts: filter-driven, one-off bulk broadcast ----------

export async function searchAccounts(query: string) {
  await requireAdmin();
  return searchCustomers(query);
}

export async function getOrderCities(): Promise<string[]> {
  await requireAdmin();
  return listOrderCities();
}

const payoutFiltersSchema = z.object({
  accountPublicId: z.string().trim().min(1).nullish(),
  revenueOp: z.enum([">", "<", "="]).nullish(),
  revenueValue: z.number().nullish(),
  startDateFrom: z.string().trim().min(1).nullish(),
  startDateTo: z.string().trim().min(1).nullish(),
  city: z.string().trim().min(1).nullish(),
});

export async function getPayoutCandidates(input: unknown): Promise<PayoutCandidate[]> {
  await requireAdmin();
  const filters = payoutFiltersSchema.parse(input) satisfies PayoutCandidateFilters;
  return listPayoutCandidates(filters);
}

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
  return awardCustomerBroadcast(rows.map((r) => r.id), data.coins, data.memo);
}
