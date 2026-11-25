"use server";

import { unexpired } from "@foundry/wallet";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { can, requirePermission } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/actions/action-result";
import { parseInput, staffAction, type Guard, type StaffActionOpts } from "@/lib/actions/staff-action";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { users, walletLedger } from "@/db/schema";
import { searchCustomers } from "@/lib/services/customers.service";
import { currentUserId } from "@/lib/services/session-service";
import { userIdByPublicId } from "@/lib/identity/user-ids";
import { emailViaRelay } from "@/lib/runtime/env";
import { assertCampaignsOnEngine } from "@/lib/notifications/relay-moved";
import {
  addGroupMembers,
  createCustomerGroup,
  emailAwardedMembers,
  emailGroup,
  emailGroupConsole,
  getCoinsActionMembers,
  giveGroupCoins,
  groupMembersCsv,
  removeGroupMember,
  searchCustomerGroups,
} from "@/lib/customer-groups/customer-groups.service";
import { listPayoutCandidates, type PayoutCandidate, type PayoutCandidateFilters } from "@/lib/services/customer-payouts.service";
import { walletBalanceSql } from "@/lib/wallet/balance-sql";

export async function searchAccounts(query: string) {
  await requirePermission({ customer: ["manage"], wallet: ["read"] });
  const rows = await searchCustomers(query);
  if (rows.length === 0) return [];
  // Spendable balance for the review table when staff add someone by hand.
  const bals = await db
    .select({
      publicId: users.publicId,
      walletCoins: walletBalanceSql().mapWith(Number),
    })
    .from(users)
    .leftJoin(walletLedger, and(eq(walletLedger.userId, users.id), unexpired(walletLedger, Date.now())))
    .where(inArray(users.publicId, rows.map((r) => r.publicId)))
    .groupBy(users.publicId);
  const byId = new Map(bals.map((b) => [b.publicId, b.walletCoins]));
  return rows.map((r) => ({ ...r, walletCoins: byId.get(r.publicId) ?? 0 }));
}

// Customer groups were admin-only; customer:manage keeps them off the member role.
const CUSTOMER_READ: Guard = { customer: ["manage"] };
const CUSTOMER_EXPORT: Guard = { customer: ["manage", "export"] };
const GROUPS: StaffActionOpts = { guard: { customer: ["manage"] }, revalidate: ["/dashboard/customer-groups"] };
const READ: StaffActionOpts = { guard: CUSTOMER_READ };
const READ_WALLET: StaffActionOpts = { guard: { customer: ["manage"], wallet: ["read"] } };

export async function searchGroupsAction(query: string): Promise<ActionResult<{ groups: { publicId: string; name: string; memberCount: number }[] }>> {
  return staffAction(READ, async () => ({ groups: await searchCustomerGroups(parseInput(z.string().max(120), query)) }));
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

export async function getPayoutCandidates(input: unknown): Promise<ActionResult<{ rows: PayoutCandidate[]; total: number }>> {
  return staffAction(READ_WALLET, async () => {
    const filters = parseInput(payoutFiltersSchema, input) satisfies PayoutCandidateFilters;
    return listPayoutCandidates(filters);
  });
}

const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Name the group").max(120),
  filters: z.record(z.string(), z.unknown()),
  userPublicIds: z.array(z.string().trim().min(1)).min(1, "Pick at least one customer"),
});

export async function createGroupAction(input: unknown): Promise<ActionResult<{ publicId: string }>> {
  return staffAction(GROUPS, async () => {
    const data = parseInput(createGroupSchema, input);
    const rows = await db.select({ id: users.id }).from(users).where(inArray(users.publicId, data.userPublicIds));
    return createCustomerGroup(
      { name: data.name, filters: data.filters, userIds: rows.map((r) => r.id) },
      await currentUserId(),
    );
  });
}

const idSchema = z.string().trim().min(1);

export async function addGroupMemberAction(groupPublicId: string, userPublicId: string): Promise<ActionResult> {
  return staffAction(GROUPS, async () => {
    const userId = await userIdByPublicId(parseInput(idSchema, userPublicId));
    if (!userId) throw new ValidationError("Customer not found");
    await addGroupMembers(parseInput(idSchema, groupPublicId), [userId]);
  });
}

export async function removeGroupMemberAction(groupPublicId: string, userPublicId: string): Promise<ActionResult> {
  return staffAction(GROUPS, async () => {
    await removeGroupMember(parseInput(idSchema, groupPublicId), parseInput(idSchema, userPublicId));
  });
}

const giveCoinsSchema = z.object({
  groupPublicId: idSchema,
  coins: z.number().int().min(1, "Coins must be at least 1"),
  memo: z.string().trim().max(200).optional(),
});

export async function giveGroupCoinsAction(input: unknown): Promise<ActionResult<{ actionPublicId: string; awarded: number; capped: number }>> {
  return staffAction({ ...GROUPS, guard: { wallet: ["give"] } }, async () => {
    const d = parseInput(giveCoinsSchema, input);
    return giveGroupCoins(d.groupPublicId, { coins: d.coins, memo: d.memo }, await currentUserId());
  });
}

export async function getCoinsActionMembersAction(
  actionPublicId: string,
): Promise<ActionResult<{ rows: Awaited<ReturnType<typeof getCoinsActionMembers>> }>> {
  return staffAction(READ_WALLET, async () => ({ rows: await getCoinsActionMembers(parseInput(idSchema, actionPublicId)) }));
}

export async function emailGroupAction(groupPublicId: string): Promise<ActionResult<{ campaignPublicId: string } | { consoleUrl: string }>> {
  return staffAction(GROUPS, async () => {
    const id = parseInput(idSchema, groupPublicId);
    return emailViaRelay() ? emailGroupConsole(id) : emailGroup(id, await currentUserId());
  });
}

export async function emailAwardedMembersAction(actionPublicId: string): Promise<ActionResult<{ campaignPublicId: string }>> {
  return staffAction(GROUPS, async () => {
    assertCampaignsOnEngine();
    return emailAwardedMembers(parseInput(idSchema, actionPublicId), await currentUserId());
  });
}

export async function exportGroupCsvAction(groupPublicId: string): Promise<ActionResult<{ csv: string }>> {
  return staffAction({ guard: CUSTOMER_EXPORT }, async () => ({
    csv: await groupMembersCsv(parseInput(idSchema, groupPublicId), { finance: await can({ finance: ["read"] }) }),
  }));
}
