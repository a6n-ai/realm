"use server";

import { revalidatePath } from "next/cache";
import { unexpired } from "@foundry/wallet";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { createCampaign } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { coinGrantGroups, coinRate, users, walletLedger } from "@/db/schema";
import { resolveSegment } from "@/lib/campaigns/segment";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { createCoinGrant, ensureGrantContactList, getCoinGrantGroup } from "@/lib/services/coin-grants.service";
import { searchCustomers } from "@/lib/services/customers.service";
import { currentUserId } from "@/lib/services/session-service";
import {
  awardCustomerBroadcast,
  listOrderCities,
  listPayoutCandidates,
  type PayoutCandidate,
  type PayoutCandidateFilters,
} from "@/lib/services/customer-payouts.service";

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

// ---------- Customer Payouts: filter-driven, one-off bulk broadcast ----------

export async function searchAccounts(query: string) {
  await requireAdmin();
  const rows = await searchCustomers(query);
  if (rows.length === 0) return [];
  // Spendable balance for the give-coins review table when staff add someone by hand.
  const bals = await db
    .select({
      publicId: users.publicId,
      walletCoins: sql<number>`cast(coalesce(sum(case when ${walletLedger.direction} = 'credit' then ${walletLedger.coins} else -${walletLedger.coins} end), 0) as int)`.mapWith(Number),
    })
    .from(users)
    .leftJoin(walletLedger, and(eq(walletLedger.userId, users.id), unexpired(walletLedger, Date.now())))
    .where(inArray(users.publicId, rows.map((r) => r.publicId)))
    .groupBy(users.publicId);
  const byId = new Map(bals.map((b) => [b.publicId, b.walletCoins]));
  return rows.map((r) => ({ ...r, walletCoins: byId.get(r.publicId) ?? 0 }));
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
  lastTiffinFrom: z.string().trim().min(1).nullish(),
  lastTiffinTo: z.string().trim().min(1).nullish(),
  lapsed: z.boolean().nullish(),
  lapsedFrom: z.string().trim().min(1).nullish(),
  lapsedTo: z.string().trim().min(1).nullish(),
});

export async function getPayoutCandidates(input: unknown): Promise<{ rows: PayoutCandidate[]; total: number }> {
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
  const result = await awardCustomerBroadcast(rows.map((r) => r.id), data.coins, data.memo, await currentUserId());
  revalidatePath(PATH, "layout");
  return result;
}

// ---------- Give coins wizard: recorded grant groups ----------

const grantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  filters: z.record(z.string(), z.unknown()),
  userPublicIds: z.array(z.string().trim().min(1)).min(1),
  coins: z.number().int().min(1),
  memo: z.string().trim().max(200).optional(),
});

export async function createCoinGrantAction(input: unknown) {
  await requireAdmin();
  const data = grantSchema.parse(input);
  const rows = await db.select({ id: users.id }).from(users).where(inArray(users.publicId, data.userPublicIds));
  const result = await createCoinGrant(
    { name: data.name, filters: data.filters, userIds: rows.map((r) => r.id), coins: data.coins, memo: data.memo },
    await currentUserId(),
  );
  revalidatePath(PATH, "layout");
  return result;
}

export async function retryGrantContactList(groupPublicId: string) {
  await requireAdmin();
  const result = await ensureGrantContactList(z.string().min(1).parse(groupPublicId));
  revalidatePath(PATH, "layout");
  return result;
}

export async function createGrantEmail(groupPublicId: string): Promise<{ campaignPublicId: string }> {
  await requireAdmin();
  const id = z.string().min(1).parse(groupPublicId);
  const [group] = await db.select().from(coinGrantGroups).where(eq(coinGrantGroups.publicId, id));
  if (!group) throw new Error("Group not found");
  const { contactListPublicId } = group.contactListPublicId
    ? { contactListPublicId: group.contactListPublicId }
    : await ensureGrantContactList(id);
  const { publicId } = await createCampaign(
    { db, tables: notificationTables, users: usersRef, resolveSegment },
    { name: `${group.name} email`, channels: ["email"], audience: { listIds: [contactListPublicId] } },
  );
  revalidatePath(PATH, "layout");
  return { campaignPublicId: publicId };
}

export async function getCoinGrantGroupAction(publicId: string) {
  await requireAdmin();
  return getCoinGrantGroup(z.string().min(1).parse(publicId));
}
