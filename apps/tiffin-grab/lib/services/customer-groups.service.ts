import "server-only";
import { ValidationError } from "@foundry/commons";
import { addContactListMembers, createCampaign, createContactList } from "@relay/engine";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  customerGroupActions,
  customerGroupMembers,
  coupons,
  customerGroups,
  users,
  walletLedger,
} from "@/db/schema";
import { resolveSegment } from "@/lib/campaigns/segment";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { listPayoutCandidates } from "./customer-payouts.service";
import { walletService } from "./wallet.service";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };
const BATCH = 500;

export type LastAction = { kind: string; createdAt: number };
export type CustomerGroupRow = {
  publicId: string;
  name: string;
  createdAt: number;
  createdBy: string | null;
  memberCount: number;
  lastAction: LastAction | null;
};
export type GroupMember = {
  publicId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  revenue: string;
  firstOrderDate: string | null;
  lastTiffin: string | null;
};
export type GroupActionRow = {
  publicId: string;
  kind: string;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  createdAt: number;
  createdBy: string | null;
};

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += BATCH) out.push(xs.slice(i, i + BATCH));
  return out;
}

async function groupByPublicId(publicId: string) {
  const [g] = await db.select().from(customerGroups).where(eq(customerGroups.publicId, publicId));
  if (!g) throw new ValidationError("Group not found");
  return g;
}

async function recountMembers(groupId: bigint) {
  await db
    .update(customerGroups)
    .set({
      memberCount: sql`(select count(*) from ${customerGroupMembers} where ${customerGroupMembers.groupId} = ${groupId})`,
    })
    .where(eq(customerGroups.id, groupId));
}

export async function createCustomerGroup(
  input: { name: string; filters: Record<string, unknown>; userIds: bigint[] },
  actorId: bigint | null,
): Promise<{ publicId: string }> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) throw new ValidationError("Pick at least one customer");
  return db.transaction(async (tx) => {
    const [g] = await tx
      .insert(customerGroups)
      .values({ name: input.name, filters: input.filters, memberCount: userIds.length, createdBy: actorId, updatedBy: actorId })
      .returning({ id: customerGroups.id, publicId: customerGroups.publicId });
    for (const slice of chunks(userIds)) {
      await tx.insert(customerGroupMembers).values(slice.map((userId) => ({ groupId: g.id, userId, createdBy: actorId })));
    }
    return { publicId: g.publicId };
  });
}

export async function addGroupMembers(groupPublicId: string, userIds: bigint[]): Promise<void> {
  const g = await groupByPublicId(groupPublicId);
  for (const slice of chunks([...new Set(userIds)])) {
    await db
      .insert(customerGroupMembers)
      .values(slice.map((userId) => ({ groupId: g.id, userId })))
      .onConflictDoNothing();
  }
  await recountMembers(g.id);
}

export async function removeGroupMember(groupPublicId: string, userPublicId: string): Promise<void> {
  const g = await groupByPublicId(groupPublicId);
  await db.delete(customerGroupMembers).where(
    and(
      eq(customerGroupMembers.groupId, g.id),
      inArray(customerGroupMembers.userId, db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId))),
    ),
  );
  await recountMembers(g.id);
}

const creator = alias(users, "creator");

// Latest action per group, via a lateral-free correlated subquery on the (group_id, created_at) index.
const lastActionSql = (groupId: typeof customerGroups.id) => ({
  kind: sql<string | null>`(select a.kind from ${customerGroupActions} a where a.group_id = ${groupId} order by a.created_at desc, a.id desc limit 1)`,
  at: sql<number | null>`(select a.created_at from ${customerGroupActions} a where a.group_id = ${groupId} order by a.created_at desc, a.id desc limit 1)`,
});

const groupSelect = () => {
  const last = lastActionSql(customerGroups.id);
  return {
    id: customerGroups.id,
    publicId: customerGroups.publicId,
    name: customerGroups.name,
    createdAt: customerGroups.createdAt,
    createdBy: creator.name,
    memberCount: customerGroups.memberCount,
    filters: customerGroups.filters,
    contactListPublicId: customerGroups.contactListPublicId,
    lastKind: last.kind,
    lastAt: last.at,
  };
};

const groupQuery = () =>
  db.select(groupSelect()).from(customerGroups).leftJoin(creator, eq(creator.id, customerGroups.createdBy));

type RawGroup = Awaited<ReturnType<typeof groupQuery>>[number];

function toRow({ lastKind, lastAt, id: _id, filters: _f, contactListPublicId: _c, ...r }: RawGroup): CustomerGroupRow {
  return { ...r, lastAction: lastKind && lastAt != null ? { kind: lastKind, createdAt: Number(lastAt) } : null };
}

export async function listCustomerGroups(page: {
  page: number;
  size: number;
}): Promise<{ rows: CustomerGroupRow[]; total: number }> {
  const [rows, [{ n }]] = await Promise.all([
    groupQuery()
      .orderBy(desc(customerGroups.createdAt), desc(customerGroups.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ n: sql<number>`count(*)::int` }).from(customerGroups),
  ]);
  return { rows: rows.map(toRow), total: n };
}

export async function getCustomerGroup(publicId: string): Promise<{
  group: CustomerGroupRow & { filters: Record<string, unknown>; contactListPublicId: string | null };
  members: GroupMember[];
} | null> {
  const [row] = await groupQuery().where(eq(customerGroups.publicId, publicId));
  if (!row) return null;
  return {
    group: { ...toRow(row), filters: row.filters, contactListPublicId: row.contactListPublicId },
    members: await memberDetails(row.id),
  };
}

// Revenue/first order/last tiffin come from the payout-candidate query; members who never ordered
// are absent there, so they fall back to blanks.
async function memberIds(groupId: bigint) {
  return (
    await db.select({ userId: customerGroupMembers.userId }).from(customerGroupMembers).where(eq(customerGroupMembers.groupId, groupId))
  ).map((r) => r.userId);
}

async function memberDetails(groupId: bigint): Promise<GroupMember[]> {
  const base = await db
    .select({ publicId: users.publicId, name: users.name, email: users.email, phone: users.phone })
    .from(customerGroupMembers)
    .innerJoin(users, eq(users.id, customerGroupMembers.userId))
    .where(eq(customerGroupMembers.groupId, groupId))
    .orderBy(users.name);
  const { rows } = await listPayoutCandidates({ userIds: await memberIds(groupId) }, { limit: 1_000_000 });
  const stats = new Map(rows.map((r) => [r.publicId, r]));
  return base.map((u) => {
    const s = stats.get(u.publicId);
    return { ...u, revenue: s?.revenue ?? "0", firstOrderDate: s?.firstOrderDate ?? null, lastTiffin: s?.lastTiffin ?? null };
  });
}

export async function listGroupActions(groupPublicId: string): Promise<GroupActionRow[]> {
  const g = await groupByPublicId(groupPublicId);
  return db
    .select({
      publicId: customerGroupActions.publicId,
      kind: customerGroupActions.kind,
      params: customerGroupActions.params,
      result: customerGroupActions.result,
      createdAt: customerGroupActions.createdAt,
      createdBy: creator.name,
    })
    .from(customerGroupActions)
    .leftJoin(creator, eq(creator.id, customerGroupActions.createdBy))
    .where(eq(customerGroupActions.groupId, g.id))
    .orderBy(desc(customerGroupActions.createdAt), desc(customerGroupActions.id));
}

export async function giveGroupCoins(
  groupPublicId: string,
  input: { coins: number; memo?: string },
  actorId: bigint | null,
): Promise<{ actionPublicId: string; awarded: number; capped: number }> {
  if (!Number.isInteger(input.coins) || input.coins <= 0) throw new ValidationError("Coins must be at least 1");
  const g = await groupByPublicId(groupPublicId);
  const memo = input.memo?.trim() || null;
  const userIds = (
    await db.select({ userId: customerGroupMembers.userId }).from(customerGroupMembers).where(eq(customerGroupMembers.groupId, g.id))
  ).map((r) => r.userId);
  if (userIds.length === 0) throw new ValidationError("Group has no members");

  // The package's cap check has no transaction handle, so it runs first, like awardCustomerBroadcast.
  const { ok, capped } = await walletService.filterUnderCap(userIds, input.coins);

  const action = await db.transaction(async (tx) => {
    const [a] = await tx
      .insert(customerGroupActions)
      .values({
        groupId: g.id,
        kind: "coins",
        params: { coins: input.coins, memo },
        result: { awardedUserIds: ok.map(String), cappedUserIds: capped.map(String) },
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning({ publicId: customerGroupActions.publicId });
    for (const slice of chunks(ok)) {
      await tx.insert(walletLedger).values(
        slice.map((userId) => ({
          userId,
          direction: "credit" as const,
          sourceType: "manual_broadcast",
          sourceId: `grant:${a.publicId}:${userId}`,
          coins: input.coins,
          memo: memo ?? "Manual customer payout",
          createdBy: actorId,
        })),
      );
    }
    return a;
  });
  return { actionPublicId: action.publicId, awarded: ok.length, capped: capped.length };
}

async function coinsAction(actionPublicId: string) {
  const [a] = await db
    .select()
    .from(customerGroupActions)
    .where(and(eq(customerGroupActions.publicId, actionPublicId), eq(customerGroupActions.kind, "coins")));
  if (!a) throw new ValidationError("Action not found");
  const r = a.result as { awardedUserIds?: string[]; cappedUserIds?: string[] };
  return { action: a, awarded: (r.awardedUserIds ?? []).map(BigInt), capped: (r.cappedUserIds ?? []).map(BigInt) };
}

export async function getCoinsActionMembers(
  actionPublicId: string,
): Promise<{ publicId: string; name: string | null; email: string | null; status: "awarded" | "capped" }[]> {
  const { awarded, capped } = await coinsAction(actionPublicId);
  const ids = [...awarded, ...capped];
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: users.id, publicId: users.publicId, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, ids))
    .orderBy(users.name);
  const awardedSet = new Set(awarded);
  return rows.map(({ id, ...u }) => ({ ...u, status: awardedSet.has(id) ? ("awarded" as const) : ("capped" as const) }));
}

async function fillList(listId: string, people: { name: string | null; email: string | null }[]) {
  // addContactListMembers dedupes on the list's unique email index, so re-runs are safe.
  for (const slice of chunks(people)) {
    const res = await addContactListMembers(
      deps,
      listId,
      slice.map((u) => ({ name: u.name?.trim() || u.email!.trim(), email: u.email!.trim() })),
    );
    if ("error" in res) throw new Error(res.error);
  }
}

const emailable = <T extends { notifyEmail: boolean; email: string | null }>(xs: T[]) =>
  xs.filter((u) => u.notifyEmail && u.email?.trim());

// A fresh list per send, so removed members and later opt-outs are never reached.
async function buildSendList(name: string, note: string, people: { name: string | null; email: string | null; notifyEmail: boolean }[]) {
  const ok = emailable(people);
  if (ok.length === 0) throw new ValidationError("No members with email to send to");
  const { publicId } = await createContactList(deps, {
    name,
    consentSource: "purchase",
    consentAt: Date.now(),
    consentNote: note,
  });
  await fillList(publicId, ok);
  return publicId;
}

async function recordEmailAction(
  groupId: bigint,
  params: Record<string, unknown>,
  campaignPublicId: string,
  actorId: bigint | null,
) {
  await db.insert(customerGroupActions).values({
    groupId,
    kind: "email",
    params,
    result: { campaignPublicId },
    createdBy: actorId,
    updatedBy: actorId,
  });
}

export async function emailGroup(groupPublicId: string, actorId: bigint | null): Promise<{ campaignPublicId: string }> {
  const group = await groupByPublicId(groupPublicId);
  const members = await db
    .select({ name: users.name, email: users.email, notifyEmail: users.notifyEmail })
    .from(customerGroupMembers)
    .innerJoin(users, eq(users.id, customerGroupMembers.userId))
    .where(eq(customerGroupMembers.groupId, group.id));
  const listId = await buildSendList(`${group.name} ${new Date().toISOString()}`, `Customer group ${group.publicId}`, members);
  const { publicId } = await createCampaign(deps, {
    name: `${group.name} email`,
    channels: ["email"],
    audience: { listIds: [listId] },
  });
  await recordEmailAction(group.id, { listPublicId: listId }, publicId, actorId);
  return { campaignPublicId: publicId };
}

export async function emailAwardedMembers(
  actionPublicId: string,
  actorId: bigint | null,
): Promise<{ campaignPublicId: string }> {
  const { action, awarded } = await coinsAction(actionPublicId);
  const [group] = await db.select().from(customerGroups).where(eq(customerGroups.id, action.groupId));
  const people = awarded.length
    ? await db
        .select({ name: users.name, email: users.email, notifyEmail: users.notifyEmail })
        .from(users)
        .where(inArray(users.id, awarded))
    : [];
  const listId = await buildSendList(
    `${group.name} coins ${actionPublicId}`,
    `Customer group ${group.publicId} action ${actionPublicId}`,
    people,
  );
  const { publicId } = await createCampaign(deps, {
    name: `${group.name} coins email`,
    channels: ["email"],
    audience: { listIds: [listId] },
  });
  await recordEmailAction(group.id, { fromAction: actionPublicId, listPublicId: listId }, publicId, actorId);
  return { campaignPublicId: publicId };
}

// Group-only coupons are never auto-apply: that would hand the discount to everyone who qualifies without a code.
export async function applyGroupCoupon(groupPublicId: string, couponPublicId: string, actorId: bigint | null): Promise<void> {
  const g = await groupByPublicId(groupPublicId);
  const [c] = await db.select().from(coupons).where(eq(coupons.publicId, couponPublicId));
  if (!c) throw new ValidationError("Coupon not found");
  if (!c.active) throw new ValidationError("Coupon is not active");
  if (c.kind === "rep_daily" || c.kind === "rep_code") throw new ValidationError("Staff coupons can't be limited to a group");
  if (c.autoApply) throw new ValidationError("An auto-apply coupon can't be limited to a group");
  if (c.customerGroupId != null && c.customerGroupId !== g.id) {
    throw new ValidationError("Coupon already belongs to another group");
  }
  await db.transaction(async (tx) => {
    await tx.update(coupons).set({ customerGroupId: g.id }).where(eq(coupons.id, c.id));
    await tx.insert(customerGroupActions).values({
      groupId: g.id,
      kind: "discount",
      params: { couponCode: c.code },
      result: {},
      createdBy: actorId,
      updatedBy: actorId,
    });
  });
}
