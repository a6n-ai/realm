"use server";

import { revalidatePath } from "next/cache";
import { unexpired } from "@foundry/wallet";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { users, walletLedger } from "@/db/schema";
import { searchCustomers } from "@/lib/services/customers.service";
import { currentUserId } from "@/lib/services/session-service";
import {
  addGroupMembers,
  applyGroupCoupon,
  createCustomerGroup,
  emailAwardedMembers,
  emailGroup,
  getCoinsActionMembers,
  giveGroupCoins,
  groupMembersCsv,
  listGroupableCoupons,
  removeGroupMember,
  searchCustomerGroups,
} from "@/lib/services/customer-groups.service";
import {
  listOrderCities,
  listPayoutCandidates,
  type PayoutCandidate,
  type PayoutCandidateFilters,
} from "@/lib/services/customer-payouts.service";

export async function searchAccounts(query: string) {
  await requireAdmin();
  const rows = await searchCustomers(query);
  if (rows.length === 0) return [];
  // Spendable balance for the review table when staff add someone by hand.
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

export async function searchGroupsAction(query: string) {
  return run(() => searchCustomerGroups(z.string().max(120).parse(query)));
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

const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Name the group").max(120),
  filters: z.record(z.string(), z.unknown()),
  userPublicIds: z.array(z.string().trim().min(1)).min(1, "Pick at least one customer"),
});

export async function createGroupAction(input: unknown): Promise<{ publicId: string }> {
  await requireAdmin();
  const data = createGroupSchema.parse(input);
  const rows = await db.select({ id: users.id }).from(users).where(inArray(users.publicId, data.userPublicIds));
  const group = await createCustomerGroup(
    { name: data.name, filters: data.filters, userIds: rows.map((r) => r.id) },
    await currentUserId(),
  );
  revalidatePath("/dashboard/customer-groups");
  return group;
}

// Server-action errors are masked in production, so expected failures travel as values.
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  await requireAdmin();
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

const idSchema = z.string().trim().min(1);

export async function addGroupMemberAction(groupPublicId: string, userPublicId: string) {
  return run(async () => {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, idSchema.parse(userPublicId)));
    if (!u) throw new Error("Customer not found");
    await addGroupMembers(idSchema.parse(groupPublicId), [u.id]);
    revalidatePath("/dashboard/customer-groups");
  });
}

export async function removeGroupMemberAction(groupPublicId: string, userPublicId: string) {
  return run(async () => {
    await removeGroupMember(idSchema.parse(groupPublicId), idSchema.parse(userPublicId));
    revalidatePath("/dashboard/customer-groups");
  });
}

const giveCoinsSchema = z.object({
  groupPublicId: idSchema,
  coins: z.number().int().min(1, "Coins must be at least 1"),
  memo: z.string().trim().max(200).optional(),
});

export async function giveGroupCoinsAction(input: unknown) {
  return run(async () => {
    const d = giveCoinsSchema.parse(input);
    const res = await giveGroupCoins(d.groupPublicId, { coins: d.coins, memo: d.memo }, await currentUserId());
    revalidatePath("/dashboard/customer-groups");
    return res;
  });
}

export async function getCoinsActionMembersAction(actionPublicId: string) {
  return run(() => getCoinsActionMembers(idSchema.parse(actionPublicId)));
}

export async function emailGroupAction(groupPublicId: string) {
  return run(async () => {
    const res = await emailGroup(idSchema.parse(groupPublicId), await currentUserId());
    revalidatePath("/dashboard/customer-groups");
    return res;
  });
}

export async function emailAwardedMembersAction(actionPublicId: string) {
  return run(async () => {
    const res = await emailAwardedMembers(idSchema.parse(actionPublicId), await currentUserId());
    revalidatePath("/dashboard/customer-groups");
    return res;
  });
}

export async function listGroupableCouponsAction() {
  return run(listGroupableCoupons);
}

export async function applyGroupCouponAction(groupPublicId: string, couponPublicId: string) {
  return run(async () => {
    await applyGroupCoupon(idSchema.parse(groupPublicId), idSchema.parse(couponPublicId), await currentUserId());
    revalidatePath("/dashboard/customer-groups");
  });
}

export async function exportGroupCsvAction(groupPublicId: string) {
  return run(() => groupMembersCsv(idSchema.parse(groupPublicId)));
}
