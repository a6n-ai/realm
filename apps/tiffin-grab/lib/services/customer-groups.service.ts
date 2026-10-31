import "server-only";
import { ValidationError, normalizeAddress } from "@foundry/commons";
import { addContactListMembers, createCampaign, createContactList, setCampaignContent } from "@relay/engine";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, ne, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import {
  campaign,
  contactList,
  contactListMember,
  customerGroupActions,
  customerGroupMembers,
  coupons,
  customerGroups,
  users,
  walletLedger,
} from "@/db/schema";
import { resolveSegment } from "@/lib/campaigns/segment";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { DEFAULT_GRANT_REASON, walletCreditedEmailDraft } from "@/lib/notifications/wallet-credited-copy";
import { listPayoutCandidates } from "./customer-payouts.service";
import { walletService } from "./wallet.service";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };
const BATCH = 500;
const log = createLogger("customer-groups");

// The write already committed; a failed list sync must not look like a failed action (staff would retry and duplicate).
async function syncAfterWrite(groupPublicId: string): Promise<string | undefined> {
  try {
    await syncGroupContactList(groupPublicId);
    return undefined;
  } catch (e) {
    log.error({ groupPublicId, err: e }, "group contact list sync failed after write");
    return "Saved, but the email list could not be updated yet. It will catch up on the next change.";
  }
}

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
export type GroupCampaignRow = { publicId: string; name: string; status: string; createdAt: number };

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
): Promise<{ publicId: string; warning?: string }> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) throw new ValidationError("Pick at least one customer");
  const created = await db.transaction(async (tx) => {
    const [g] = await tx
      .insert(customerGroups)
      .values({ name: input.name, filters: input.filters, memberCount: userIds.length, createdBy: actorId, updatedBy: actorId })
      .returning({ id: customerGroups.id, publicId: customerGroups.publicId });
    for (const slice of chunks(userIds)) {
      await tx.insert(customerGroupMembers).values(slice.map((userId) => ({ groupId: g.id, userId, createdBy: actorId })));
    }
    return { publicId: g.publicId };
  });
  return { ...created, warning: await syncAfterWrite(created.publicId) };
}

export async function addGroupMembers(groupPublicId: string, userIds: bigint[]): Promise<{ warning?: string }> {
  const g = await groupByPublicId(groupPublicId);
  for (const slice of chunks([...new Set(userIds)])) {
    await db
      .insert(customerGroupMembers)
      .values(slice.map((userId) => ({ groupId: g.id, userId })))
      .onConflictDoNothing();
  }
  await recountMembers(g.id);
  return { warning: await syncAfterWrite(groupPublicId) };
}

export async function removeGroupMember(groupPublicId: string, userPublicId: string): Promise<{ warning?: string }> {
  const g = await groupByPublicId(groupPublicId);
  await db.delete(customerGroupMembers).where(
    and(
      eq(customerGroupMembers.groupId, g.id),
      inArray(customerGroupMembers.userId, db.select({ id: users.id }).from(users).where(eq(users.publicId, userPublicId))),
    ),
  );
  await recountMembers(g.id);
  return { warning: await syncAfterWrite(groupPublicId) };
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

export type EpochRange = { from: number; to: number };

export async function listCustomerGroups(page: {
  page: number;
  size: number;
  range?: EpochRange;
}): Promise<{ rows: CustomerGroupRow[]; total: number }> {
  const where = page.range
    ? and(gte(customerGroups.createdAt, page.range.from), lte(customerGroups.createdAt, page.range.to))
    : undefined;
  const [rows, [{ n }]] = await Promise.all([
    groupQuery()
      .where(where)
      .orderBy(desc(customerGroups.createdAt), desc(customerGroups.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ n: sql<number>`count(*)::int` }).from(customerGroups).where(where),
  ]);
  return { rows: rows.map(toRow), total: n };
}

export async function searchCustomerGroups(q: string): Promise<{ publicId: string; name: string; memberCount: number }[]> {
  const term = q.trim();
  return db
    .select({ publicId: customerGroups.publicId, name: customerGroups.name, memberCount: customerGroups.memberCount })
    .from(customerGroups)
    .where(term ? ilike(customerGroups.name, `%${term}%`) : undefined)
    .orderBy(desc(customerGroups.createdAt), desc(customerGroups.id))
    .limit(20);
}

const groupsCreatedIn = (r: EpochRange) => and(gte(customerGroups.createdAt, r.from), lte(customerGroups.createdAt, r.to));

async function groupsInRange(r: EpochRange): Promise<{ groups: number; members: number }> {
  const [row] = await db
    .select({ groups: sql<number>`count(*)::int`, members: sql<number>`coalesce(sum(${customerGroups.memberCount}), 0)::int` })
    .from(customerGroups)
    .where(groupsCreatedIn(r));
  return row;
}

/** Wallet -> Give coins cards: every manual_broadcast credit created inside the range. */
export async function giveCoinsStats(r: EpochRange) {
  const [[g], { groups }] = await Promise.all([
    db
      .select({
        coins: sql<number>`coalesce(sum(${walletLedger.coins}), 0)::int`,
        customers: sql<number>`count(distinct ${walletLedger.userId})::int`,
        grants: sql<number>`count(distinct case when ${walletLedger.sourceId} like 'grant:%' then split_part(${walletLedger.sourceId}, ':', 2) else ${walletLedger.sourceId} end)::int`,
      })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.sourceType, "manual_broadcast"),
          eq(walletLedger.direction, "credit"),
          gte(walletLedger.createdAt, r.from),
          lte(walletLedger.createdAt, r.to),
        ),
      ),
    groupsInRange(r),
  ]);
  return {
    coinsGiven: g.coins,
    customersRewarded: g.customers,
    grants: g.grants,
    groups,
    avgCoinsPerCustomer: g.customers ? g.coins / g.customers : 0,
  };
}

/** Customer groups cards: groups created in the range and the actions taken in it. */
export async function customerGroupStats(r: EpochRange) {
  const [{ groups, members }, [a]] = await Promise.all([
    groupsInRange(r),
    db
      .select({
        actions: sql<number>`count(*)::int`,
        coins: sql<number>`coalesce(sum(case when ${customerGroupActions.kind} = 'coins' then coalesce((${customerGroupActions.params}->>'coins')::int, 0) * coalesce(jsonb_array_length(${customerGroupActions.result}->'awardedUserIds'), 0) else 0 end), 0)::int`,
        emails: sql<number>`count(*) filter (where ${customerGroupActions.kind} = 'email')::int`,
      })
      .from(customerGroupActions)
      .where(and(gte(customerGroupActions.createdAt, r.from), lte(customerGroupActions.createdAt, r.to))),
  ]);
  return { groups, members, actions: a.actions, coinsViaGroups: a.coins, emailsSent: a.emails };
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

const csvCell = (v: string | null) => {
  const raw = v ?? "";
  const t = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
};

export async function groupMembersCsv(groupPublicId: string): Promise<string> {
  const detail = await getCustomerGroup(groupPublicId);
  if (!detail) throw new ValidationError("Group not found");
  const lines = [
    ["Name", "Email", "Phone", "Revenue", "Ordering since", "Last tiffin"],
    ...detail.members.map((m) => [m.name, m.email, m.phone, m.revenue, m.firstOrderDate, m.lastTiffin]),
  ];
  return lines.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function listGroupActions(groupPublicId: string): Promise<GroupActionRow[]> {
  const g = await groupByPublicId(groupPublicId);
  const actions = await db
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
  if (!g.contactListPublicId) return actions;

  // Campaigns created straight from the audience picker leave no action row. An email action already
  // names its campaign, so those are skipped here and each campaign shows once.
  const recorded = new Set(actions.map((a) => a.result.campaignPublicId).filter((x) => typeof x === "string"));
  const targeting = await db
    .select({
      publicId: campaign.publicId,
      name: campaign.name,
      status: campaign.status,
      createdAt: campaign.createdAt,
      scheduledAt: campaign.scheduledAt,
      sentAt: campaign.sentAt,
    })
    .from(campaign)
    .where(sql`${campaign.audience} -> 'listIds' @> ${JSON.stringify([g.contactListPublicId])}::jsonb`);
  const fromCampaigns: GroupActionRow[] = targeting
    .filter((c) => !recorded.has(c.publicId))
    .map((c) => ({
      publicId: c.publicId,
      kind: "campaign",
      params: { name: c.name, status: c.status },
      result: { campaignPublicId: c.publicId },
      createdAt: Number(c.sentAt ?? c.scheduledAt ?? c.createdAt),
      createdBy: null,
    }));
  return [...actions, ...fromCampaigns].sort((a, b) => b.createdAt - a.createdAt);
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

/**
 * Keeps the group's Relay contact list equal to its current emailable members, so the campaign
 * audience picker can offer the group as a list. Members are replaced wholesale: removals and opt-outs drop off.
 */
export async function syncGroupContactList(groupPublicId: string): Promise<{ contactListPublicId: string }> {
  const group = await groupByPublicId(groupPublicId);
  const listName = `Customer group · ${group.name}`;
  let listPublicId = group.contactListPublicId;
  let [list] = listPublicId
    ? await db.select({ id: contactList.id, name: contactList.name }).from(contactList).where(eq(contactList.publicId, listPublicId))
    : [];
  if (!list) {
    // First sync, or the list was deleted out from under the group.
    const created = await createContactList(deps, {
      name: listName,
      consentSource: "purchase",
      consentAt: Date.now(),
      consentNote: `Customer group ${group.publicId}`,
    });
    const claimed = await db
      .update(customerGroups)
      .set({ contactListPublicId: created.publicId })
      .where(
        and(
          eq(customerGroups.id, group.id),
          listPublicId ? eq(customerGroups.contactListPublicId, listPublicId) : isNull(customerGroups.contactListPublicId),
        ),
      )
      .returning({ id: customerGroups.id });
    if (claimed.length) listPublicId = created.publicId;
    else {
      // A concurrent sync won; discard our empty list.
      await db.delete(contactList).where(eq(contactList.publicId, created.publicId));
      listPublicId = (await groupByPublicId(groupPublicId)).contactListPublicId!;
    }
    [list] = await db.select({ id: contactList.id, name: contactList.name }).from(contactList).where(eq(contactList.publicId, listPublicId));
  }
  const listId = list.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cg-list:${group.id}`}))`);
    if (list.name !== listName) await tx.update(contactList).set({ name: listName }).where(eq(contactList.id, listId));
    const people = emailable(
      await tx
        .select({ name: users.name, email: users.email, notifyEmail: users.notifyEmail })
        .from(customerGroupMembers)
        .innerJoin(users, eq(users.id, customerGroupMembers.userId))
        .where(and(eq(customerGroupMembers.groupId, group.id), ne(users.status, "deleted"))),
    );
    const desired = new Map(people.map((u) => [normalizeAddress(u.email!), u]));
    const current = await tx
      .select({ id: contactListMember.id, email: contactListMember.email })
      .from(contactListMember)
      .where(eq(contactListMember.listId, listId));
    const have = new Set(current.map((m) => m.email));
    const extra = current.filter((m) => !m.email || !desired.has(m.email)).map((m) => m.id);
    for (const slice of chunks(extra)) await tx.delete(contactListMember).where(inArray(contactListMember.id, slice));
    const missing = [...desired].filter(([email]) => !have.has(email));
    for (const slice of chunks(missing)) {
      await tx
        .insert(contactListMember)
        .values(slice.map(([email, u]) => ({ listId, email, name: u.name?.trim() || email, vars: {} })));
    }
    await tx
      .update(contactList)
      .set({ memberCount: sql`(select count(*) from ${contactListMember} where ${contactListMember.listId} = ${listId})` })
      .where(eq(contactList.id, listId));
  });
  return { contactListPublicId: listPublicId! };
}

/**
 * Resyncs every group containing the user, and drops them from the one-off "email awarded members" lists
 * when they are no longer emailable; call after anything that changes their notifyEmail, email or status.
 * Awarded lists are pruned by the user's award, not their current membership, and even if a group sync throws.
 */
export async function syncGroupsForUser(userId: bigint): Promise<void> {
  const groups = await db
    .select({ publicId: customerGroups.publicId })
    .from(customerGroupMembers)
    .innerJoin(customerGroups, eq(customerGroups.id, customerGroupMembers.groupId))
    .where(eq(customerGroupMembers.userId, userId));
  const failures: unknown[] = [];
  for (const g of groups) {
    try {
      await syncGroupContactList(g.publicId);
    } catch (e) {
      log.error({ groupPublicId: g.publicId, err: e }, "group contact list sync failed");
      failures.push(e);
    }
  }
  try {
    await pruneAwardedLists(userId);
  } catch (e) {
    failures.push(e);
  }
  if (failures.length) throw failures[0];
}

// Removal only: the one-off list is a snapshot, but it must never mail someone who has since opted out or left.
export async function pruneAwardedLists(userId: bigint) {
  const awardedActions = await db
    .select({ publicId: customerGroupActions.publicId })
    .from(customerGroupActions)
    .where(and(eq(customerGroupActions.kind, "coins"), sql`${customerGroupActions.result} -> 'awardedUserIds' ? ${String(userId)}`));
  if (awardedActions.length === 0) return;
  const emails = await db
    .select({ fromAction: sql<string>`${customerGroupActions.params} ->> 'fromAction'`, listPublicId: sql<string>`${customerGroupActions.params} ->> 'listPublicId'` })
    .from(customerGroupActions)
    .where(
      and(
        eq(customerGroupActions.kind, "email"),
        inArray(sql`${customerGroupActions.params} ->> 'fromAction'`, awardedActions.map((a) => a.publicId)),
      ),
    );
  for (const e of emails) {
    try {
      const { awarded } = await coinsAction(e.fromAction);
      const [list] = await db.select({ id: contactList.id }).from(contactList).where(eq(contactList.publicId, e.listPublicId));
      if (!list) continue;
      const people = awarded.length
        ? emailable(
            await db
              .select({ email: users.email, notifyEmail: users.notifyEmail })
              .from(users)
              .where(and(inArray(users.id, awarded), ne(users.status, "deleted"))),
          )
        : [];
      const keep = people.map((u) => normalizeAddress(u.email!));
      await db
        .delete(contactListMember)
        .where(and(eq(contactListMember.listId, list.id), keep.length ? notInArray(contactListMember.email, keep) : undefined));
      await db
        .update(contactList)
        .set({ memberCount: sql`(select count(*) from ${contactListMember} where ${contactListMember.listId} = ${list.id})` })
        .where(eq(contactList.id, list.id));
    } catch (err) {
      log.error({ listPublicId: e.listPublicId, err }, "could not prune awarded list");
    }
  }
}

/** ponytail: re-syncs every group per campaign page view; fine for dozens of groups, sync only stale ones if it grows. Returns the groups that failed. */
export async function syncAllGroupContactLists(): Promise<string[]> {
  const groups = await db.select({ publicId: customerGroups.publicId }).from(customerGroups);
  const failed: string[] = [];
  for (const g of groups) {
    try {
      await syncGroupContactList(g.publicId);
    } catch (e) {
      log.error({ groupPublicId: g.publicId, err: e }, "group contact list sync failed");
      failed.push(g.publicId);
    }
  }
  return failed;
}

/**
 * Resyncs the groups behind a campaign's audience lists right before a send/schedule. Returns the names of groups
 * that could not be synced; the caller must refuse, since a stale list can still hold an opted-out member.
 * ponytail: Relay itself never rechecks notifyEmail at send time; that recheck belongs in Relay.
 */
export async function staleGroupsForCampaign(campaignPublicId: string): Promise<string[]> {
  const [c] = await db.select({ audience: campaign.audience }).from(campaign).where(eq(campaign.publicId, campaignPublicId));
  const listIds = (c?.audience as { listIds?: string[] } | null)?.listIds ?? [];
  if (listIds.length === 0) return [];
  const groups = await db
    .select({ publicId: customerGroups.publicId, name: customerGroups.name })
    .from(customerGroups)
    .where(inArray(customerGroups.contactListPublicId, listIds));
  const stale: string[] = [];
  for (const g of groups) {
    try {
      await syncGroupContactList(g.publicId);
    } catch (e) {
      log.error({ groupPublicId: g.publicId, err: e }, "group contact list sync failed before send");
      stale.push(g.name);
    }
  }
  return stale;
}

export async function emailGroup(groupPublicId: string, actorId: bigint | null): Promise<{ campaignPublicId: string }> {
  const { contactListPublicId: listId } = await syncGroupContactList(groupPublicId);
  const group = await groupByPublicId(groupPublicId);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contactListMember)
    .innerJoin(contactList, eq(contactList.id, contactListMember.listId))
    .where(eq(contactList.publicId, listId));
  if (n === 0) throw new ValidationError("No members with email to send to");
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
  const params = action.params as { coins: number; memo?: string | null };
  const draft = await walletCreditedEmailDraft(params.coins, params.memo?.trim() || DEFAULT_GRANT_REASON);
  const content = await setCampaignContent(deps, publicId, { channel: "email", locale: "en", ...draft });
  if ("error" in content) throw new Error(content.error);
  await recordEmailAction(group.id, { fromAction: actionPublicId, listPublicId: listId }, publicId, actorId);
  return { campaignPublicId: publicId };
}

// Group-only coupons are never auto-apply: that would hand the discount to everyone who qualifies without a code.
// `fromForm`: the coupon form may attach an inactive coupon and move it between groups.
export async function applyGroupCoupon(
  groupPublicId: string,
  couponPublicId: string,
  actorId: bigint | null,
  opts: { fromForm?: boolean } = {},
): Promise<void> {
  const g = await groupByPublicId(groupPublicId);
  const [c] = await db.select().from(coupons).where(eq(coupons.publicId, couponPublicId));
  if (!c) throw new ValidationError("Coupon not found");
  if (!c.active && !opts.fromForm) throw new ValidationError("Coupon is not active");
  if (c.kind === "rep_daily" || c.kind === "rep_code") throw new ValidationError("Staff coupons can't be limited to a group");
  if (c.autoApply) throw new ValidationError("An auto-apply coupon can't be limited to a group");
  if (c.customerGroupId != null && c.customerGroupId !== g.id && !opts.fromForm) {
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

/** Coupon form saves the group with the coupon; this only records the one `discount` action for a newly attached group. */
export async function recordCouponGroupAction(groupId: bigint, couponCode: string, actorId: bigint | null): Promise<void> {
  try {
    await db.insert(customerGroupActions).values({
      groupId,
      kind: "discount",
      params: { couponCode },
      result: {},
      createdBy: actorId,
      updatedBy: actorId,
    });
  } catch (e) {
    log.error({ groupId, err: e }, "could not record coupon group action");
  }
}
