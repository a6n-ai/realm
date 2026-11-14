import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { coupons, couponRedemptions, customerGroupActions, customerGroupMembers, customerGroups, ledgerEntries, orders, users } =
  await import("@/db/schema");
const { couponsService } = await import("../coupons.service");

const MSG = "This code isn't available for your account";
let member: bigint;
let outsider: bigint;
let groupId: bigint;
let gc: typeof coupons.$inferSelect;
const couponIds: bigint[] = [];
const groupIds: bigint[] = [];
const userIds: bigint[] = [];

const mk = async (code: string, extra: Partial<typeof coupons.$inferInsert> = {}) => {
  const [c] = await db
    .insert(coupons)
    .values({ code, kind: "fixed", name: code, valueAmount: "5", active: true, visible: true, ...extra })
    .returning();
  couponIds.push(c.id);
  return c;
};

beforeAll(async () => {
  const us = await db
    .insert(users)
    .values([{ email: "cgc-member@throwaway.local", name: "M" }, { email: "cgc-out@throwaway.local", name: "O" }])
    .returning({ id: users.id });
  [member, outsider] = us.map((u) => u.id);
  userIds.push(member, outsider);
  const gs = await db
    .insert(customerGroups)
    .values([{ name: "cgc-a", filters: {} }, { name: "cgc-b", filters: {} }])
    .returning();
  groupIds.push(...gs.map((g) => g.id));
  groupId = gs[0].id;
  await db.insert(customerGroupMembers).values({ groupId, userId: member });
  gc = await mk("CGC-GROUP", { customerGroupId: groupId });
});

afterAll(async () => {
  await db.delete(couponRedemptions).where(inArray(couponRedemptions.couponId, couponIds));
  await db.delete(ledgerEntries).where(inArray(ledgerEntries.userId, userIds));
  await db.delete(orders).where(inArray(orders.userId, userIds));
  await db.delete(coupons).where(inArray(coupons.id, couponIds));
  await db.delete(customerGroupActions).where(inArray(customerGroupActions.groupId, groupIds));
  await db.delete(customerGroupMembers).where(inArray(customerGroupMembers.groupId, groupIds));
  await db.delete(customerGroups).where(inArray(customerGroups.id, groupIds));
  await db.delete(users).where(inArray(users.id, userIds));
});

describe("group-only coupons", () => {
  it("previews for a member", async () => {
    const line = await couponsService.validatePublicCode("CGC-GROUP", { subtotal: 100, userId: member });
    expect(line.amount).toBe(5);
  });

  it("rejects a non-member and a missing user", async () => {
    await expect(couponsService.validatePublicCode("CGC-GROUP", { subtotal: 100, userId: outsider })).rejects.toThrow(MSG);
    await expect(couponsService.validatePublicCode("CGC-GROUP", { subtotal: 100 })).rejects.toThrow(MSG);
    await expect(couponsService.validatePublicCode("CGC-GROUP", { subtotal: 100, userId: null })).rejects.toThrow(MSG);
  });

  it("resolveBestCoupons never returns it for a non-member, even typed", async () => {
    const r = await couponsService.resolveBestCoupons({ subtotal: 100, userId: outsider, manualCode: "CGC-GROUP" });
    expect(r.redemptions.map((x) => x.coupon.code)).not.toContain("CGC-GROUP");
    expect(r.manualErrors[0]?.error).toBe(MSG);
    const m = await couponsService.resolveBestCoupons({ subtotal: 100, userId: member, manualCode: "CGC-GROUP" });
    expect(m.redemptions.map((x) => x.coupon.code)).toContain("CGC-GROUP");
  });

  it("redeem inside the tx rejects a non-member and allows a member", async () => {
    await expect(
      db.transaction((tx) => couponsService.redeem(tx, { coupon: gc, userId: outsider, orderId: 0n, amountApplied: 5 })),
    ).rejects.toThrow(MSG);
    // A member passes the group gate; the bogus order id then fails on the FK, not on membership.
    const err = await db
      .transaction((tx) => couponsService.redeem(tx, { coupon: gc, userId: member, orderId: 0n, amountApplied: 5 }))
      .then(() => null, (e: unknown) => e);
    expect(err).not.toBeNull();
    expect(String((err as Error).message)).not.toContain(MSG);
  });

  it("deferred settlement skips the membership re-check; the immediate path does not", async () => {
    const [u] = await db.insert(users).values({ email: "cgc-removed@throwaway.local", name: "R" }).returning({ id: users.id });
    userIds.push(u.id);
    await db.insert(customerGroupMembers).values({ groupId, userId: u.id });
    await couponsService.validatePublicCode("CGC-GROUP", { subtotal: 100, userId: u.id });
    await db.delete(customerGroupMembers).where(eq(customerGroupMembers.userId, u.id));
    await expect(
      db.transaction((tx) => couponsService.redeem(tx, { coupon: gc, userId: u.id, orderId: 0n, amountApplied: 5 })),
    ).rejects.toThrow(MSG);
    const err = await db
      .transaction((tx) => couponsService.redeem(tx, { coupon: gc, userId: u.id, orderId: 0n, amountApplied: 5, deferredSettlement: true }))
      .then(() => null, (e: unknown) => e);
    expect(String((err as Error).message)).not.toContain(MSG);
  });

  it("listAvailable: member yes, non-member and null no", async () => {
    const codes = async (u: bigint | null) => (await couponsService.listAvailable(u)).map((c) => c.code);
    expect(await codes(member)).toContain("CGC-GROUP");
    expect(await codes(outsider)).not.toContain("CGC-GROUP");
    expect(await codes(null)).not.toContain("CGC-GROUP");
  });
});
