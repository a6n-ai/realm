import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import {
  customerGroupActions,
  customerGroupMembers,
  customerGroups,
  contactList,
  contactListMember,
  users,
  walletLedger,
} from "@/db/schema";
import {
  addGroupMembers,
  createCustomerGroup,
  emailAwardedMembers,
  emailGroup,
  ensureGroupContactList,
  getCoinsActionMembers,
  getCustomerGroup,
  giveGroupCoins,
  listCustomerGroups,
  listGroupActions,
  removeGroupMember,
} from "../customer-groups.service";
import { campaign as campaigns } from "@/db/schema";

vi.mock("../app-settings.service", async (orig) => ({
  ...(await orig<typeof import("../app-settings.service")>()),
  getMaxWalletBalance: async () => 100,
}));

let uOk: bigint;
let uCapped: bigint;
let uNoEmail: bigint;
let uOkPublic: string;
const groupIds: bigint[] = [];

beforeAll(async () => {
  const rows = await db.insert(users).values([
    { email: "cg-ok@throwaway.local", name: "Ok" },
    { email: "cg-capped@throwaway.local", name: "Capped" },
    { email: "cg-noemail@throwaway.local", name: "NoEmail", notifyEmail: false },
  ]).returning();
  [uOk, uCapped, uNoEmail] = rows.map((r) => r.id);
  uOkPublic = rows[0].publicId;
  await db.insert(walletLedger).values({
    userId: uCapped, direction: "credit", sourceType: "test_fill", sourceId: `cg-test:${uCapped}`, coins: 100,
  });
});

afterAll(async () => {
  const ids = [uOk, uCapped, uNoEmail];
  const groups = groupIds.length ? await db.select().from(customerGroups).where(inArray(customerGroups.id, groupIds)) : [];
  const listPublicIds = groups.map((g) => g.contactListPublicId).filter((x): x is string => !!x);
  const camps = await db.select().from(campaigns);
  const mine = camps.filter((c) => (c.audience as { listIds?: string[] } | null)?.listIds?.some((l) => listPublicIds.includes(l)));
  if (mine.length) await db.delete(campaigns).where(inArray(campaigns.id, mine.map((c) => c.id)));
  for (const pid of new Set(listPublicIds)) {
    const [l] = await db.select().from(contactList).where(eq(contactList.publicId, pid));
    if (l) {
      await db.delete(contactListMember).where(eq(contactListMember.listId, l.id));
      await db.delete(contactList).where(eq(contactList.id, l.id));
    }
  }
  if (groupIds.length) {
    await db.delete(customerGroupActions).where(inArray(customerGroupActions.groupId, groupIds));
    await db.delete(customerGroupMembers).where(inArray(customerGroupMembers.groupId, groupIds));
    await db.delete(customerGroups).where(inArray(customerGroups.id, groupIds));
  }
  await db.delete(walletLedger).where(inArray(walletLedger.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

async function mk(name: string, userIds: bigint[], actor: bigint | null = null) {
  const r = await createCustomerGroup({ name, filters: {}, userIds }, actor);
  const [g] = await db.select().from(customerGroups).where(eq(customerGroups.publicId, r.publicId));
  groupIds.push(g.id);
  return { ...r, id: g.id };
}

async function listMemberCount(pid: string) {
  const [l] = await db.select().from(contactList).where(eq(contactList.publicId, pid));
  return (await db.select().from(contactListMember).where(eq(contactListMember.listId, l.id))).length;
}

describe("customer groups", () => {
  it("creates a group with members and memberCount", async () => {
    const g = await mk("g1", [uOk, uCapped, uOk], uOk);
    const detail = await getCustomerGroup(g.publicId);
    expect(detail?.group.memberCount).toBe(2);
    expect(detail?.group.createdBy).toBe("Ok");
    expect(detail?.members).toHaveLength(2);
    expect(detail?.group.lastAction).toBeNull();
  });

  it("adds and removes members", async () => {
    const g = await mk("g2", [uOk]);
    await addGroupMembers(g.publicId, [uOk, uNoEmail]);
    expect((await getCustomerGroup(g.publicId))?.group.memberCount).toBe(2);
    await removeGroupMember(g.publicId, uOkPublic);
    const d = await getCustomerGroup(g.publicId);
    expect(d?.group.memberCount).toBe(1);
    expect(d?.members.map((m) => m.name)).toEqual(["NoEmail"]);
  });

  it("coins action: awards under cap, records capped, one ledger row, statuses stable across actions", async () => {
    const g = await mk("g3", [uOk, uCapped]);
    const r = await giveGroupCoins(g.publicId, { coins: 10 }, uOk);
    expect(r).toMatchObject({ awarded: 1, capped: 1 });
    expect(r.actionPublicId).toMatch(/^cga_/);
    const ledger = await db.select().from(walletLedger).where(eq(walletLedger.sourceType, "manual_broadcast"));
    const mine = ledger.filter((l) => l.userId === uOk || l.userId === uCapped);
    expect(mine).toHaveLength(1);
    expect(mine[0].sourceId).toMatch(/^grant:cga_[^:]+:\d+$/);
    const first = await getCoinsActionMembers(r.actionPublicId);
    expect(first.map((m) => m.status).sort()).toEqual(["awarded", "capped"]);

    await giveGroupCoins(g.publicId, { coins: 5, memo: "again" }, uOk);
    expect((await getCoinsActionMembers(r.actionPublicId)).map((m) => m.status).sort()).toEqual(["awarded", "capped"]);
    const actions = await listGroupActions(g.publicId);
    expect(actions).toHaveLength(2);
    expect(actions[0].createdAt).toBeGreaterThanOrEqual(actions[1].createdAt);
    expect((await getCustomerGroup(g.publicId))?.group.lastAction?.kind).toBe("coins");
  });

  it("zero coins rejected", async () => {
    const g = await mk("g4", [uOk]);
    await expect(giveGroupCoins(g.publicId, { coins: 0 }, null)).rejects.toThrow(ValidationError);
  });

  it("ensureGroupContactList is idempotent and holds all emailable members", async () => {
    const g = await mk("g5", [uOk, uCapped, uNoEmail]);
    const a = await ensureGroupContactList(g.publicId);
    const b = await ensureGroupContactList(g.publicId);
    expect(b.contactListPublicId).toBe(a.contactListPublicId);
    expect(a.noEmail).toBe(1);
    expect(await listMemberCount(a.contactListPublicId)).toBe(2);
  });

  it("emailGroup creates a campaign on the group list and records an action", async () => {
    const g = await mk("g6", [uOk]);
    const { campaignPublicId } = await emailGroup(g.publicId, uOk);
    const { contactListPublicId } = await ensureGroupContactList(g.publicId);
    const [c] = await db.select().from(campaigns).where(eq(campaigns.publicId, campaignPublicId));
    expect((c.audience as { listIds: string[] }).listIds).toEqual([contactListPublicId]);
    const actions = await listGroupActions(g.publicId);
    expect(actions.map((a) => a.kind)).toEqual(["email"]);
  });

  it("emailAwardedMembers lists only awarded members", async () => {
    const g = await mk("g7", [uOk, uCapped]);
    const r = await giveGroupCoins(g.publicId, { coins: 10 }, uOk);
    const { campaignPublicId } = await emailAwardedMembers(r.actionPublicId, uOk);
    const [c] = await db.select().from(campaigns).where(eq(campaigns.publicId, campaignPublicId));
    const listIds = (c.audience as { listIds: string[] }).listIds;
    expect(listIds).toHaveLength(1);
    expect(await listMemberCount(listIds[0])).toBe(1);
    const email = (await listGroupActions(g.publicId)).find((a) => a.kind === "email");
    expect(email?.params).toMatchObject({ fromAction: r.actionPublicId });
    // one-off list is cleaned up via the campaign delete + list sweep below
    const [l] = await db.select().from(contactList).where(eq(contactList.publicId, listIds[0]));
    await db.delete(campaigns).where(eq(campaigns.publicId, campaignPublicId));
    await db.delete(contactListMember).where(eq(contactListMember.listId, l.id));
    await db.delete(contactList).where(eq(contactList.id, l.id));
  });

  it("listCustomerGroups pages are 0-indexed and disjoint", async () => {
    await Promise.all([1, 2, 3].map((n) => mk(`paging-${n}`, [uOk])));
    const p0 = await listCustomerGroups({ page: 0, size: 2 });
    const p1 = await listCustomerGroups({ page: 1, size: 2 });
    const a = p0.rows.map((r) => r.publicId);
    const b = p1.rows.map((r) => r.publicId);
    expect(a).toHaveLength(2);
    expect(b.length).toBeGreaterThan(0);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
    expect(p0.total).toBeGreaterThanOrEqual(3);
  });
});
