import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import {
  deliveryCategorySwaps,
  dishCategories,
  mealSizeItems,
  mealSizes,
  mealRules,
  plans,
  users,
} from "@/db/schema";
import { attachAllCategoriesToPlans } from "@/db/test-helpers";

const mockGetSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { dishCategoriesService } = await import("../dish-categories.service");
const { mealRulesService } = await import("../meal-rules.service");
const { mealSizeService } = await import("../catalog.service");

const PREFIX = "zz-p8-";
const USER_EMAIL = "zz-p8-user@example.test";
const CAT_A = `${PREFIX}cat-a`;
const CAT_B = `${PREFIX}cat-b`;

let planPublicId = "";
let planId: bigint;
const createdSwapIds: string[] = [];
const createdRuleIds: string[] = [];

async function cleanup() {
  for (const id of createdRuleIds.splice(0)) {
    await db.delete(mealRules).where(eq(mealRules.publicId, id));
  }
  for (const id of createdSwapIds.splice(0)) {
    await dishCategoriesService.removeSwapPair(id).catch(() => undefined);
  }
  await db.delete(mealSizes).where(like(mealSizes.key, `${PREFIX}%`));
  await db.delete(plans).where(like(plans.key, `${PREFIX}%`));
  await db.delete(dishCategories).where(like(dishCategories.key, `${PREFIX}%`));
  await db.delete(users).where(eq(users.email, USER_EMAIL));
}

beforeAll(async () => {
  await cleanup();
  const [u] = await db.insert(users).values({ email: USER_EMAIL, name: "P8" }).returning();
  mockGetSession.mockResolvedValue({ user: { id: u.publicId } });

  const [p] = await db
    .insert(plans)
    .values({ key: `${PREFIX}plan`, name: "P8 Plan", planType: "tiffin" })
    .returning();
  planId = p.id;
  planPublicId = p.publicId;

  await db.insert(dishCategories).values([
    { key: CAT_A, label: "P8 A", enabled: true, sortOrder: 90 },
    { key: CAT_B, label: "P8 B", enabled: true, sortOrder: 91 },
  ]);
  await attachAllCategoriesToPlans();
});

afterAll(cleanup);

describe("Phase 8 swap-rule safeguards", () => {
  it("rejects duplicate directional pair; accepts reverse; allows self-swap", async () => {
    const fwd = await dishCategoriesService.addSwapPair(CAT_A, CAT_B, planPublicId);
    createdSwapIds.push(fwd.publicId);

    await expect(dishCategoriesService.addSwapPair(CAT_A, CAT_B, planPublicId)).rejects.toThrow(
      /already exists for this direction/i,
    );

    const rev = await dishCategoriesService.addSwapPair(CAT_B, CAT_A, planPublicId);
    createdSwapIds.push(rev.publicId);
    expect(rev.publicId).not.toBe(fwd.publicId);

    const self = await dishCategoriesService.addSwapPair(CAT_A, CAT_A, planPublicId);
    createdSwapIds.push(self.publicId);
    expect(self.fromCategoryId).toBe(self.toCategoryId);
  });

  it("rejects disabled/missing categories and unknown plans; allows global rules", async () => {
    await expect(dishCategoriesService.addSwapPair("no-such-cat", CAT_B, planPublicId)).rejects.toThrow(
      /disabled or not found/i,
    );

    const [row] = await db.select().from(dishCategories).where(eq(dishCategories.key, CAT_B)).limit(1);
    await db.update(dishCategories).set({ enabled: false }).where(eq(dishCategories.id, row!.id));
    try {
      await expect(dishCategoriesService.addSwapPair(CAT_A, CAT_B, planPublicId)).rejects.toThrow(/disabled or not found/i);
    } finally {
      await db.update(dishCategories).set({ enabled: true }).where(eq(dishCategories.id, row!.id));
    }

    // Global self-pair on B is supported.
    const global = await dishCategoriesService.addSwapPair(CAT_B, CAT_B, planPublicId);
    createdSwapIds.push(global.publicId);
  });
});

describe("Phase 8 meal-rule safeguards", () => {
  it("rejects invalid plan, category, and max; accepts 1/2/3; upserts duplicates", async () => {
    await expect(
      mealRulesService.upsertByPlanPublicId({
        planPublicId: "nope",
        categoryKey: CAT_A,
        condition: "exclusive_to_plan",
        maxCount: 1,
      }),
    ).rejects.toThrow(/Plan not found/i);

    await expect(
      mealRulesService.upsertByPlanPublicId({
        planPublicId,
        categoryKey: "not-on-plan-zzz",
        condition: "exclusive_to_plan",
        maxCount: 1,
      }),
    ).rejects.toThrow(/not available on this plan/i);

    await expect(
      mealRulesService.upsertByPlanPublicId({
        planPublicId,
        categoryKey: CAT_A,
        condition: "exclusive_to_plan",
        maxCount: 0,
      }),
    ).rejects.toThrow(/1 or more/i);

    let publicId = "";
    for (const maxCount of [1, 2, 3]) {
      const row = await mealRulesService.upsertByPlanPublicId({
        planPublicId,
        categoryKey: CAT_A,
        condition: "exclusive_to_plan",
        maxCount,
      });
      publicId = row.publicId;
      const listed = await mealRulesService.listAll();
      expect(listed.find((r) => r.publicId === publicId)?.maxCount).toBe(maxCount);
    }
    createdRuleIds.push(publicId);

    const again = await mealRulesService.upsertByPlanPublicId({
      planPublicId,
      categoryKey: CAT_A,
      condition: "exclusive_to_plan",
      maxCount: 2,
    });
    expect(again.publicId).toBe(publicId);
    const listed = await mealRulesService.listAll();
    expect(listed.filter((r) => r.planPublicId === planPublicId && r.categoryKey === CAT_A)).toHaveLength(1);
  });
});

describe("Phase 8 historical safety", () => {
  it("meal-size composition edits do not mutate delivery_category_swaps snapshots", async () => {
    const before = await db.select().from(deliveryCategorySwaps);
    const [ms] = await db
      .insert(mealSizes)
      .values({
        key: `${PREFIX}size`,
        name: "P8 Size",
        planId,
        tier: "medium",
        kcalMin: 100,
        kcalMax: 200,
        basePrice: "9.99",
      })
      .returning();

    await mealSizeService.update(ms.publicId, {
      planId: planPublicId,
      items: [
        { category: CAT_A, tuAmount: "1.00", planId: planPublicId },
        { category: CAT_B, tuAmount: "0.50", planId: planPublicId },
      ],
    });

    const after = await db.select().from(deliveryCategorySwaps);
    expect(after).toEqual(before);

    const items = await db.select().from(mealSizeItems).where(eq(mealSizeItems.mealSizeId, ms.id));
    expect(items).toHaveLength(2);
  });
});
