import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { coinGrantGroupMembers, coinGrantGroups, contactList, contactListMember, users, walletLedger } from "@/db/schema";
import { createCoinGrant, ensureGrantContactList, getCoinGrantGroup } from "../coin-grants.service";

vi.mock("../app-settings.service", async (orig) => ({
  ...(await orig<typeof import("../app-settings.service")>()),
  getMaxWalletBalance: async () => 100,
}));

let uOk: bigint;
let uCapped: bigint;
let uNoEmail: bigint;
const groupIds: bigint[] = [];
const listPublicIds: string[] = [];

beforeAll(async () => {
  const rows = await db.insert(users).values([
    { email: "cg-ok@throwaway.local", name: "Ok" },
    { email: "cg-capped@throwaway.local", name: "Capped" },
    { email: "cg-noemail@throwaway.local", name: "NoEmail", notifyEmail: false },
  ]).returning();
  [uOk, uCapped, uNoEmail] = rows.map((r) => r.id);
  await db.insert(walletLedger).values({
    userId: uCapped, direction: "credit", sourceType: "test_fill", sourceId: `cg-test:${uCapped}`, coins: 100,
  });
});

afterAll(async () => {
  const ids = [uOk, uCapped, uNoEmail];
  const groups = await db.select().from(coinGrantGroups).where(inArray(coinGrantGroups.id, groupIds));
  for (const g of groups) if (g.contactListPublicId) listPublicIds.push(g.contactListPublicId);
  if (groupIds.length) await db.delete(coinGrantGroupMembers).where(inArray(coinGrantGroupMembers.groupId, groupIds));
  if (groupIds.length) await db.delete(coinGrantGroups).where(inArray(coinGrantGroups.id, groupIds));
  for (const pid of new Set(listPublicIds)) {
    const [l] = await db.select().from(contactList).where(eq(contactList.publicId, pid));
    if (l) {
      await db.delete(contactListMember).where(eq(contactListMember.listId, l.id));
      await db.delete(contactList).where(eq(contactList.id, l.id));
    }
  }
  await db.delete(walletLedger).where(inArray(walletLedger.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

async function listMemberCount(pid: string) {
  const [l] = await db.select().from(contactList).where(eq(contactList.publicId, pid));
  return (await db.select().from(contactListMember).where(eq(contactListMember.listId, l.id))).length;
}

describe("coin grants", () => {
  it("awards under cap, records capped member", async () => {
    const r = await createCoinGrant({ name: "t1", filters: {}, userIds: [uOk, uCapped], coins: 10 }, uOk);
    const [g] = await db.select().from(coinGrantGroups).where(eq(coinGrantGroups.publicId, r.publicId));
    groupIds.push(g.id);
    expect(r).toMatchObject({ awarded: 1, capped: 1 });
    expect(g.createdBy).toBe(uOk);
    const members = await db.select().from(coinGrantGroupMembers).where(eq(coinGrantGroupMembers.groupId, g.id));
    expect(members.find((m) => m.userId === uOk)?.awarded).toBe(true);
    expect(members.find((m) => m.userId === uCapped)?.awarded).toBe(false);
    const ledger = await db.select().from(walletLedger).where(eq(walletLedger.sourceType, "manual_broadcast"));
    const mine = ledger.filter((l) => l.userId === uOk || l.userId === uCapped);
    expect(mine).toHaveLength(1);
    expect(mine[0].sourceId).toMatch(/^grant:[^:]+:\d+$/);
    const detail = await getCoinGrantGroup(r.publicId);
    expect(detail?.members.map((m) => m.status).sort()).toEqual(["awarded", "capped"]);
  });

  it("contact list holds only awarded members with email", async () => {
    const r = await createCoinGrant({ name: "t2", filters: {}, userIds: [uOk, uNoEmail], coins: 5 }, uOk);
    const [g] = await db.select().from(coinGrantGroups).where(eq(coinGrantGroups.publicId, r.publicId));
    groupIds.push(g.id);
    expect(r.noEmail).toBe(1);
    expect(r.listError).toBeNull();
    expect(await listMemberCount(g.contactListPublicId!)).toBe(1);
  });

  it("ensureGrantContactList is idempotent", async () => {
    const r = await createCoinGrant({ name: "t3", filters: {}, userIds: [uOk], coins: 1 }, null);
    const [g] = await db.select().from(coinGrantGroups).where(eq(coinGrantGroups.publicId, r.publicId));
    groupIds.push(g.id);
    const a = await ensureGrantContactList(r.publicId);
    const b = await ensureGrantContactList(r.publicId);
    expect(b.contactListPublicId).toBe(a.contactListPublicId);
    expect(await listMemberCount(a.contactListPublicId)).toBe(1);
  });

  it("zero coins rejected", async () => {
    await expect(createCoinGrant({ name: "t4", filters: {}, userIds: [uOk], coins: 0 }, null)).rejects.toThrow(ValidationError);
  });
});
