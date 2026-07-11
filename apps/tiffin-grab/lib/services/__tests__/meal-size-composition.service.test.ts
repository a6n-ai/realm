import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import { dishCategories, mealSizeItems, mealSizes, plans, users } from "@/db/schema";

// The meal-size service stamps updatedBy from the session actor; give it a real
// user so we can assert the parent audit stamp survives the item full-replace.
const mockGetSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { mealSizeService } = await import("../catalog.service");

const PLAN_KEY = "zz-msz-plan";
const SIZE_KEY = "zz-msz-size";
const USER_EMAIL = "zz-msz-user@example.test";
const CAT_A = "zz-msz-cat-a";
const CAT_B = "zz-msz-cat-b";

let planId: bigint;
let planPublicId: string;
let sizeId: bigint;
let sizePublicId: string;
let userId: bigint;

async function cleanup() {
  await db.delete(mealSizes).where(like(mealSizes.key, "zz-msz-%")); // FK cascade wipes its items
  await db.delete(plans).where(like(plans.key, "zz-msz-%"));
  await db.delete(dishCategories).where(like(dishCategories.key, "zz-msz-%"));
  await db.delete(users).where(eq(users.email, USER_EMAIL));
}

beforeAll(async () => {
  await cleanup();
  const [u] = await db.insert(users).values({ email: USER_EMAIL, name: "ZZ Actor" }).returning();
  userId = u.id;
  mockGetSession.mockResolvedValue({ user: { id: u.publicId } });

  const [p] = await db.insert(plans).values({ key: PLAN_KEY, name: "ZZ Plan", planType: "tiffin" }).returning();
  planId = p.id;
  planPublicId = p.publicId;

  await db.insert(dishCategories).values([
    { planType: "tiffin", key: CAT_A, label: "Cat A", enabled: true, sortOrder: 0 },
    { planType: "tiffin", key: CAT_B, label: "Cat B", enabled: true, sortOrder: 1 },
  ]);
});

beforeEach(async () => {
  await db.delete(mealSizes).where(like(mealSizes.key, "zz-msz-%"));
  const [m] = await db
    .insert(mealSizes)
    .values({ key: SIZE_KEY, name: "ZZ Size", planId, tier: "medium", kcalMin: 100, kcalMax: 200, basePrice: "9.99" })
    .returning();
  sizeId = m.id;
  sizePublicId = m.publicId;
  // A stale item that a full-replace save must delete.
  await db.insert(mealSizeItems).values({ mealSizeId: m.id, name: "STALE", category: CAT_A, qty: 1, sortOrder: 0 });
});

afterAll(cleanup);

describe("MealSizeService composition save", () => {
  it("resolves the plan publicId to plans.id, full-replaces items, and stamps updatedBy", async () => {
    await mealSizeService.update(sizePublicId, {
      key: SIZE_KEY,
      name: "ZZ Size",
      tier: "medium",
      planId: planPublicId,
      kcalMin: "100",
      kcalMax: "200",
      basePrice: "9.99",
      items: [
        { name: "Paneer Masala", category: CAT_A, weightValue: "6", weightUnit: "oz", qty: 2 },
        { name: "Jeera Rice", category: CAT_B, weightValue: "", weightUnit: "", qty: 1 },
      ],
    });

    const [ms] = await db.select().from(mealSizes).where(eq(mealSizes.id, sizeId));
    expect(ms.planId).toBe(planId);
    expect(ms.updatedBy).toBe(userId);

    const items = await db
      .select()
      .from(mealSizeItems)
      .where(eq(mealSizeItems.mealSizeId, sizeId))
      .orderBy(asc(mealSizeItems.sortOrder));
    expect(items.map((i) => i.name)).toEqual(["Paneer Masala", "Jeera Rice"]); // STALE gone
    expect(items.map((i) => i.sortOrder)).toEqual([0, 1]);
    expect(items.every((i) => i.name.length > 0)).toBe(true); // NOT NULL name populated
    expect(items[0].weightUnit).toBe("oz");
    expect(items[1].weightValue).toBeNull();
    expect(items[1].weightUnit).toBeNull();
  });

  it("rejects an unknown category soft-ref and writes nothing", async () => {
    await expect(
      mealSizeService.update(sizePublicId, {
        planId: planPublicId,
        items: [{ name: "Mystery", category: "not-a-real-category", qty: 1 }],
      }),
    ).rejects.toThrow();

    // The stale item is untouched — the rejection happened before any write.
    const items = await db.select().from(mealSizeItems).where(eq(mealSizeItems.mealSizeId, sizeId));
    expect(items.map((i) => i.name)).toEqual(["STALE"]);
  });

  it("empty items array clears the composition (full replace to zero)", async () => {
    await mealSizeService.update(sizePublicId, { planId: planPublicId, items: [] });
    const items = await db.select().from(mealSizeItems).where(eq(mealSizeItems.mealSizeId, sizeId));
    expect(items).toHaveLength(0);
  });
});
