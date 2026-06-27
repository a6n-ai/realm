import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { ValidationError } from "@tiffin/commons";

// The settings actions go through requireAdmin() and revalidatePath(); stub both
// so the action path runs outside a request scope. The point under test is the
// rep_daily guard and that a public coupon round-trips by public_id.
vi.mock("@/lib/auth/guards", () => ({ requireAdmin: async () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { coupons, couponRedemptions, ledgerEntries } = await import("@/db/schema");
const { saveCoupon, setCouponActive } = await import(
  "@/app/(dashboard)/dashboard/settings/discounts/actions"
);

const basePatch = {
  code: "WELCOME10",
  name: "Welcome offer",
  stackable: false,
  active: true,
  planTypes: [] as string[],
};

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(couponRedemptions);
  await db.delete(coupons).where(ne(coupons.kind, "rep_daily"));
  await db.delete(coupons);
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

    await setCouponActive(row.publicId, false);
    const [after] = await db.select().from(coupons).where(eq(coupons.publicId, row.publicId));
    expect(after.active).toBe(false);
  });
});
