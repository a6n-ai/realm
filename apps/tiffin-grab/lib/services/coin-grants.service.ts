import "server-only";
import { ValidationError } from "@foundry/commons";
import { addContactListMembers, createContactList } from "@relay/engine";
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { coinGrantGroupMembers, coinGrantGroups, users, walletLedger } from "@/db/schema";
import { resolveSegment } from "@/lib/campaigns/segment";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { walletService } from "./wallet.service";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };
const BATCH = 500;

export type CoinGrantGroupRow = {
  publicId: string;
  name: string;
  createdAt: number;
  givenBy: string | null;
  memberCount: number;
  awardedCount: number;
  cappedCount: number;
  noEmailCount: number;
  coins: number;
  contactListPublicId: string | null;
};

export type CoinGrantInput = {
  name: string;
  filters: Record<string, unknown>;
  userIds: bigint[];
  coins: number;
  memo?: string;
};

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += BATCH) out.push(xs.slice(i, i + BATCH));
  return out;
}

export async function createCoinGrant(
  input: CoinGrantInput,
  actorId: bigint | null,
): Promise<{ publicId: string; awarded: number; capped: number; noEmail: number; listError: string | null }> {
  if (!Number.isInteger(input.coins) || input.coins <= 0) throw new ValidationError("Coins must be at least 1");
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) throw new ValidationError("Pick at least one customer");

  // The package's cap check has no transaction handle, so it runs first, like awardCustomerBroadcast.
  const { ok, capped } = await walletService.filterUnderCap(userIds, input.coins);
  const okSet = new Set(ok);

  const group = await db.transaction(async (tx) => {
    const [g] = await tx
      .insert(coinGrantGroups)
      .values({
        name: input.name,
        filters: input.filters,
        coins: input.coins,
        memo: input.memo?.trim() || null,
        memberCount: userIds.length,
        awardedCount: ok.length,
        cappedCount: capped.length,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning({ id: coinGrantGroups.id, publicId: coinGrantGroups.publicId });

    for (const slice of chunks(userIds)) {
      await tx.insert(coinGrantGroupMembers).values(
        slice.map((userId) => ({ groupId: g.id, userId, awarded: okSet.has(userId), createdBy: actorId })),
      );
    }
    for (const slice of chunks(ok)) {
      await tx.insert(walletLedger).values(
        slice.map((userId) => ({
          userId,
          direction: "credit" as const,
          sourceType: "manual_broadcast",
          sourceId: `grant:${g.publicId}:${userId}`,
          coins: input.coins,
          memo: input.memo?.trim() || "Manual customer payout",
          createdBy: actorId,
        })),
      );
    }
    return g;
  });

  // Coins are already paid; a mailing-list failure must not undo them.
  try {
    const { noEmail } = await ensureGrantContactList(group.publicId);
    return { publicId: group.publicId, awarded: ok.length, capped: capped.length, noEmail, listError: null };
  } catch (e) {
    return {
      publicId: group.publicId,
      awarded: ok.length,
      capped: capped.length,
      noEmail: 0,
      listError: e instanceof Error ? e.message : "Could not build the email list",
    };
  }
}

export async function ensureGrantContactList(
  groupPublicId: string,
): Promise<{ contactListPublicId: string; noEmail: number }> {
  const [group] = await db.select().from(coinGrantGroups).where(eq(coinGrantGroups.publicId, groupPublicId));
  if (!group) throw new ValidationError("Group not found");

  let listId = group.contactListPublicId;
  if (!listId) {
    ({ publicId: listId } = await createContactList(deps, {
      name: group.name,
      consentSource: "purchase",
      consentAt: Date.now(),
      consentNote: `Give coins group ${group.publicId}`,
    }));
    await db.update(coinGrantGroups).set({ contactListPublicId: listId }).where(eq(coinGrantGroups.id, group.id));
  }

  const awarded = await db
    .select({ name: users.name, email: users.email, notifyEmail: users.notifyEmail })
    .from(coinGrantGroupMembers)
    .innerJoin(users, eq(users.id, coinGrantGroupMembers.userId))
    .where(and(eq(coinGrantGroupMembers.groupId, group.id), eq(coinGrantGroupMembers.awarded, true)));
  const emailable = awarded.filter((u) => u.notifyEmail && u.email?.trim());
  const noEmail = awarded.length - emailable.length;

  // addContactListMembers dedupes on the list's unique email index, so re-runs are safe.
  for (const slice of chunks(emailable)) {
    const res = await addContactListMembers(
      deps,
      listId,
      slice.map((u) => ({ name: u.name?.trim() || u.email, email: u.email })),
    );
    if ("error" in res) throw new Error(res.error);
  }
  await db.update(coinGrantGroups).set({ noEmailCount: noEmail }).where(eq(coinGrantGroups.id, group.id));
  return { contactListPublicId: listId, noEmail };
}

const giver = alias(users, "giver");

const groupSelect = {
  publicId: coinGrantGroups.publicId,
  name: coinGrantGroups.name,
  createdAt: coinGrantGroups.createdAt,
  givenBy: giver.name,
  memberCount: coinGrantGroups.memberCount,
  awardedCount: coinGrantGroups.awardedCount,
  cappedCount: coinGrantGroups.cappedCount,
  noEmailCount: coinGrantGroups.noEmailCount,
  coins: coinGrantGroups.coins,
  contactListPublicId: coinGrantGroups.contactListPublicId,
};

export async function listCoinGrantGroups(page: {
  page: number;
  size: number;
}): Promise<{ rows: CoinGrantGroupRow[]; total: number }> {
  const [rows, [{ n }]] = await Promise.all([
    db
      .select(groupSelect)
      .from(coinGrantGroups)
      .leftJoin(giver, eq(giver.id, coinGrantGroups.createdBy))
      .orderBy(desc(coinGrantGroups.createdAt))
      .limit(page.size)
      .offset((Math.max(page.page, 1) - 1) * page.size),
    db.select({ n: sql<number>`count(*)::int` }).from(coinGrantGroups),
  ]);
  return { rows, total: n };
}

export async function getCoinGrantGroup(publicId: string): Promise<{
  group: CoinGrantGroupRow;
  members: { publicId: string; name: string | null; email: string | null; status: "awarded" | "capped" | "no_email" }[];
} | null> {
  const [row] = await db
    .select({ ...groupSelect, id: coinGrantGroups.id })
    .from(coinGrantGroups)
    .leftJoin(giver, eq(giver.id, coinGrantGroups.createdBy))
    .where(eq(coinGrantGroups.publicId, publicId));
  if (!row) return null;
  const { id, ...group } = row;
  const m = await db
    .select({
      publicId: users.publicId,
      name: users.name,
      email: users.email,
      notifyEmail: users.notifyEmail,
      awarded: coinGrantGroupMembers.awarded,
    })
    .from(coinGrantGroupMembers)
    .innerJoin(users, eq(users.id, coinGrantGroupMembers.userId))
    .where(eq(coinGrantGroupMembers.groupId, id))
    .orderBy(users.name);
  return {
    group,
    members: m.map((u) => ({
      publicId: u.publicId,
      name: u.name,
      email: u.email,
      status: !u.awarded ? "capped" : u.notifyEmail && u.email?.trim() ? "awarded" : "no_email",
    })),
  };
}
