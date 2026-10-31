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
  campaignContent,
  notificationOutbox,
  users,
  walletLedger,
} from "@/db/schema";
import {
  addGroupMembers,
  customerGroupStats,
  giveCoinsStats,
  createCustomerGroup,
  emailAwardedMembers,
  emailGroup,
  getCoinsActionMembers,
  getCustomerGroup,
  groupMembersCsv,
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
let uCappedPublic: string;
const groupIds: bigint[] = [];

const run = Date.now();

beforeAll(async () => {
  const rows = await db.insert(users).values([
    { email: `cg-ok-${run}@throwaway.local`, name: "Ok" },
    { email: `cg-capped-${run}@throwaway.local`, name: "Capped" },
    { email: `cg-noemail-${run}@throwaway.local`, name: "NoEmail", notifyEmail: false },
  ]).returning();
  [uOk, uCapped, uNoEmail] = rows.map((r) => r.id);
  uOkPublic = rows[0].publicId;
  uCappedPublic = rows[1].publicId;
  await db.insert(walletLedger).values({
    userId: uCapped, direction: "credit", sourceType: "test_fill", sourceId: `cg-test:${uCapped}`, coins: 100,
  });
});

afterAll(async () => {
  const ids = [uOk, uCapped, uNoEmail];
  const acts = groupIds.length
    ? await db.select().from(customerGroupActions).where(inArray(customerGroupActions.groupId, groupIds))
    : [];
  const listPublicIds = acts.map((a) => a.params.listPublicId).filter((x): x is string => typeof x === "string");
  const camps = await db.select().from(campaigns);
  const mine = camps.filter((c) => (c.audience as { listIds?: string[] } | null)?.listIds?.some((l) => listPublicIds.includes(l)));
  if (mine.length) await db.delete(campaignContent).where(inArray(campaignContent.campaignId, mine.map((c) => c.id)));
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
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, ids));
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

  it("emailGroup builds a fresh list of current emailable members and records an action", async () => {
    const g = await mk("g6", [uOk, uCapped, uNoEmail]);
    await removeGroupMember(g.publicId, uCappedPublic);
    const { campaignPublicId } = await emailGroup(g.publicId, uOk);
    const [c] = await db.select().from(campaigns).where(eq(campaigns.publicId, campaignPublicId));
    const listIds = (c.audience as { listIds: string[] }).listIds;
    expect(listIds).toHaveLength(1);
    // Capped was removed, NoEmail has notifyEmail=false: only Ok is on the list.
    expect(await listMemberCount(listIds[0])).toBe(1);
    expect((await listGroupActions(g.publicId)).map((a) => a.kind)).toEqual(["email"]);
    await emailGroup(g.publicId, uOk);
    expect((await listGroupActions(g.publicId)).filter((a) => a.kind === "email")).toHaveLength(2);
  });

  it("emailing with no eligible recipients is rejected", async () => {
    const g = await mk("g6b", [uNoEmail]);
    await expect(emailGroup(g.publicId, null)).rejects.toThrow(ValidationError);
    const g2 = await mk("g6c", [uCapped]);
    const r = await giveGroupCoins(g2.publicId, { coins: 10 }, null);
    expect(r.awarded).toBe(0);
    await expect(emailAwardedMembers(r.actionPublicId, null)).rejects.toThrow(ValidationError);
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
    await db.delete(campaignContent).where(eq(campaignContent.campaignId, c.id));
    await db.delete(campaigns).where(eq(campaigns.publicId, campaignPublicId));
    await db.delete(contactListMember).where(eq(contactListMember.listId, l.id));
    await db.delete(contactList).where(eq(contactList.id, l.id));
  });

  it("giveGroupCoins sends no wallet_credited; the coins email is prefilled with the coin count", async () => {
    const g = await mk("g7b", [uOk, uCapped]);
    const r = await giveGroupCoins(g.publicId, { coins: 7, memo: "Diwali" }, uOk);
    const rows = await db.select().from(notificationOutbox).where(inArray(notificationOutbox.recipientId, [uOk, uCapped]));
    expect(rows.filter((x) => x.event === "wallet_credited")).toHaveLength(0);

    const { campaignPublicId } = await emailAwardedMembers(r.actionPublicId, uOk);
    const [c] = await db.select().from(campaigns).where(eq(campaigns.publicId, campaignPublicId));
    const [content] = await db.select().from(campaignContent).where(eq(campaignContent.campaignId, c.id));
    expect(content.channel).toBe("email");
    expect(content.subject).toContain("7");
    expect(content.html).toContain("Diwali");
    await db.delete(campaignContent).where(eq(campaignContent.campaignId, c.id));
    await db.delete(campaigns).where(eq(campaigns.publicId, campaignPublicId));
  });

  it("legacy group (coins columns set) and its backfilled action render member statuses", async () => {
    const g = await mk("legacy", [uOk, uCapped]);
    await db.update(customerGroups).set({ coins: 7, memo: "old" }).where(eq(customerGroups.publicId, g.publicId));
    const [grp] = await db.select().from(customerGroups).where(eq(customerGroups.publicId, g.publicId));
    const [a] = await db.insert(customerGroupActions).values({
      groupId: grp.id,
      kind: "coins",
      params: { coins: 7, memo: "old", legacy: true },
      result: { awardedUserIds: [String(uOk)], cappedUserIds: [String(uCapped)] },
    }).returning({ publicId: customerGroupActions.publicId });
    const m = await getCoinsActionMembers(a.publicId);
    expect(m.map((x) => [x.name, x.status]).sort()).toEqual([["Capped", "capped"], ["Ok", "awarded"]]);
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

  it("neutralises spreadsheet formulas in exported cells", async () => {
    const [u] = await db.insert(users).values({ email: "cg-csv-f@throwaway.local", name: '=HYPERLINK("x")' }).returning();
    try {
      const g = await mk("csv-formula-group", [u.id]);
      const csv = await groupMembersCsv(g.publicId);
      expect(csv).toContain('"\'=HYPERLINK(""x"")",cg-csv-f@throwaway.local,');
    } finally {
      await db.delete(customerGroupMembers).where(eq(customerGroupMembers.userId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }
  });

  it("exports members as RFC 4180 CSV with quoted special characters", async () => {
    const [u] = await db.insert(users).values({ email: "cg-csv@throwaway.local", name: 'Doe, "Jo"\nX' }).returning();
    try {
      const g = await mk("csv-group", [u.id]);
      const csv = await groupMembersCsv(g.publicId);
      expect(csv.split("\r\n")[0]).toBe("Name,Email,Phone,Revenue,Ordering since,Last tiffin");
      expect(csv).toContain('"Doe, ""Jo""\nX",cg-csv@throwaway.local,');
    } finally {
      await db.delete(customerGroupMembers).where(eq(customerGroupMembers.userId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }
  });

  it("stats count only what happened inside the range", async () => {
    const t0 = Date.now() - 1;
    const range = { from: t0, to: t0 + 3_600_000 };
    const before = { give: await giveCoinsStats(range), groups: await customerGroupStats(range) };
    const g = await mk("stats-group", [uOk, uCapped]);
    await giveGroupCoins(g.publicId, { coins: 10 }, uOk);
    await emailGroup(g.publicId, uOk);
    const give = await giveCoinsStats(range);
    const groups = await customerGroupStats(range);
    expect(give.coinsGiven - before.give.coinsGiven).toBe(10);
    expect(give.customersRewarded - before.give.customersRewarded).toBe(1);
    expect(give.grants - before.give.grants).toBe(1);
    expect(give.groups - before.give.groups).toBe(1);
    expect(give.avgCoinsPerCustomer).toBeGreaterThan(0);
    expect(groups.groups - before.groups.groups).toBe(1);
    expect(groups.members - before.groups.members).toBe(2);
    expect(groups.actions - before.groups.actions).toBe(2);
    expect(groups.coinsViaGroups - before.groups.coinsViaGroups).toBe(10);
    expect(groups.emailsSent - before.groups.emailsSent).toBe(1);

    const past = await customerGroupStats({ from: 0, to: 1000 });
    expect(past).toEqual({ groups: 0, members: 0, actions: 0, coinsViaGroups: 0, emailsSent: 0 });
  });

  it("grants count events: one per group action, one per renewals-page broadcast row", async () => {
    const t0 = Date.now() - 1;
    const range = { from: t0, to: t0 + 3_600_000 };
    const before = await giveCoinsStats(range);
    const g = await mk("grant-events", [uOk, uNoEmail]);
    await giveGroupCoins(g.publicId, { coins: 3 }, uOk);
    const tag = `cg-bc-${Date.now()}`;
    await db.insert(walletLedger).values([uOk, uNoEmail].map((userId, n) => ({
      userId, direction: "credit" as const, sourceType: "manual_broadcast", sourceId: `broadcast:${tag}-${n}:${userId}`, coins: 4, memo: "t",
    })));
    const after = await giveCoinsStats(range);
    expect(after.grants - before.grants).toBe(1 + 2);
    expect(after.coinsGiven - before.coinsGiven).toBe(3 * 2 + 4 * 2);
    expect(after.customersRewarded - before.customersRewarded).toBeGreaterThanOrEqual(0);
    expect(after.customersRewarded).toBeGreaterThanOrEqual(2);
    await db.delete(walletLedger).where(eq(walletLedger.memo, "t"));
  });
});
