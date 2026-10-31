import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";

// The settings actions go through requireAdmin() and revalidatePath(); stub both
// so the action path runs outside a request scope. The point under test is the
// rep_daily guard and that a public coupon round-trips by public_id.
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: async () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { coupons, couponRedemptions, customerGroupActions, customerGroups, ledgerEntries } = await import("@/db/schema");
const { couponKind } = await import("@/db/schema/coupons");
const { setDiscountPolicy } = await import("@/lib/services/app-settings.service");
const { saveCoupon, setCouponActive } = await import(
  "@/app/(dashboard)/dashboard/discounts/actions"
);

const basePatch = {
  code: "WELCOME10",
  name: "Welcome offer",
  stackable: false,
  autoApply: false,
  visible: true,
  active: true,
  planTypes: [] as string[],
};

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(couponRedemptions);
  await db.delete(coupons).where(ne(coupons.kind, "rep_daily"));
  await db.delete(coupons);
  // The shared app_settings.discountPolicy is mutated by other live-DB suites
  // (e.g. wf3 leaves enabledKinds restricted). Restore the all-kinds default so
  // saveCoupon's enabled-kind gate doesn't depend on cross-file run order.
  await setDiscountPolicy({
    enabledKinds: [...couponKind.enumValues],
    repDaily: { enabled: false, defaultCapPct: 0, defaultCapAmount: 0, defaultDailyUses: 1, codeValidityHours: 48, perRep: {} },
  });
}

describe("discounts settings actions", () => {
  beforeEach(reset);
  afterAll(reset);

  it("rejects manual creation of a rep_daily coupon", async () => {
    await expect(
      saveCoupon(null, { ...basePatch, kind: "rep_daily" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const rows = await db.select().from(coupons);
    expect(rows).toHaveLength(0);
  });

  it("creates a percentage coupon and toggles active via public_id", async () => {
    await saveCoupon(null, { ...basePatch, kind: "percentage", valuePct: 10 });
    const [row] = await db.select().from(coupons).where(eq(coupons.code, "WELCOME10"));
    expect(row.kind).toBe("percentage");
    expect(row.valuePct).toBe("10.00");
    expect(row.active).toBe(true);
    expect(row.visible).toBe(true);

    await setCouponActive(row.publicId, false);
    const [after] = await db.select().from(coupons).where(eq(coupons.publicId, row.publicId));
    expect(after.active).toBe(false);
  });

  it("persists visible=false for private/manual-entry codes", async () => {
    await saveCoupon(null, {
      ...basePatch,
      code: "PRIVATE10",
      kind: "percentage",
      valuePct: 10,
      visible: false,
    });
    const [row] = await db.select().from(coupons).where(eq(coupons.code, "PRIVATE10"));
    expect(row.visible).toBe(false);
  });
});

describe("coupon form customer group", () => {
  beforeEach(reset);
  afterAll(reset);

  it("records one discount action when a group is set, none on re-save or clear, and blocks auto-apply", async () => {
    const [g] = await db.insert(customerGroups).values({ name: "form-group", filters: {} }).returning();
    try {
      const patch = { ...basePatch, code: "GRPFORM", kind: "percentage" as const, valuePct: 10, customerGroupPublicId: g.publicId };
      await saveCoupon(null, patch);
      const [c] = await db.select().from(coupons).where(eq(coupons.code, "GRPFORM"));
      expect(c.customerGroupId).toBe(g.id);
      const actions = () => db.select().from(customerGroupActions).where(eq(customerGroupActions.groupId, g.id));
      expect(await actions()).toHaveLength(1);
      expect((await actions())[0].kind).toBe("discount");

      await saveCoupon(c.publicId, patch);
      expect(await actions()).toHaveLength(1);

      await expect(saveCoupon(c.publicId, { ...patch, autoApply: true })).rejects.toBeInstanceOf(ValidationError);

      await saveCoupon(c.publicId, { ...patch, customerGroupPublicId: null });
      const [cleared] = await db.select().from(coupons).where(eq(coupons.id, c.id));
      expect(cleared.customerGroupId).toBeNull();
      expect(await actions()).toHaveLength(1);
    } finally {
      await db.delete(coupons).where(eq(coupons.code, "GRPFORM"));
      await db.delete(customerGroupActions).where(eq(customerGroupActions.groupId, g.id));
      await db.delete(customerGroups).where(eq(customerGroups.id, g.id));
    }
  });
});
