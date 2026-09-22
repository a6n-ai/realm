import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { mealRules, plans } = await import("@/db/schema");
const { mealRulesService } = await import("@/lib/services/meal-rules.service");

const created: string[] = [];

afterEach(async () => {
  const ids = created.splice(0);
  if (ids.length) await db.delete(mealRules).where(inArray(mealRules.publicId, ids));
});

describe("mealRulesService admin CRUD", () => {
  it("upserts, updates maxCount, toggles enabled, and deletes", async () => {
    const [plan] = await db.select().from(plans).where(eq(plans.key, "non-veg")).limit(1);
    expect(plan).toBeDefined();

    const { publicId } = await mealRulesService.upsertByPlanPublicId({
      planPublicId: plan!.publicId,
      categoryKey: "sabzi",
      condition: "exclusive_to_plan",
      maxCount: 1,
      enabled: true,
    });
    created.push(publicId);

    let listed = await mealRulesService.listAll();
    expect(listed.find((r) => r.publicId === publicId)).toMatchObject({
      planPublicId: plan!.publicId,
      categoryKey: "sabzi",
      maxCount: 1,
      enabled: true,
    });

    await mealRulesService.updateRule(publicId, { maxCount: 2 });
    listed = await mealRulesService.listAll();
    expect(listed.find((r) => r.publicId === publicId)?.maxCount).toBe(2);

    await mealRulesService.updateRule(publicId, { enabled: false });
    listed = await mealRulesService.listAll();
    expect(listed.find((r) => r.publicId === publicId)?.enabled).toBe(false);

    // Upsert same key updates rather than duplicating.
    const again = await mealRulesService.upsertByPlanPublicId({
      planPublicId: plan!.publicId,
      categoryKey: "sabzi",
      condition: "exclusive_to_plan",
      maxCount: 3,
      enabled: true,
    });
    expect(again.publicId).toBe(publicId);
    listed = await mealRulesService.listAll();
    expect(listed.filter((r) => r.planPublicId === plan!.publicId && r.categoryKey === "sabzi")).toHaveLength(1);
    expect(listed.find((r) => r.publicId === publicId)).toMatchObject({ maxCount: 3, enabled: true });

    await mealRulesService.deleteRule(publicId);
    created.length = 0;
    listed = await mealRulesService.listAll();
    expect(listed.find((r) => r.publicId === publicId)).toBeUndefined();
  });
});
