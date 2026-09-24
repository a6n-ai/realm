import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { dishes, mealRuleConditions, mealRules, mealSizes, plans } = await import("@/db/schema");
const { mealRulesService } = await import("../meal-rules.service");

/**
 * Scope and enablement are decided in SQL, so they need a real database — the
 * pure-engine tests can only assert what happens to rules already handed over.
 */
async function reset() {
  const ids = await db.select({ id: mealRules.id }).from(mealRules).where(like(mealRules.publicId, "%"));
  if (ids.length) {
    await db.delete(mealRuleConditions).where(inArray(mealRuleConditions.ruleId, ids.map((r) => r.id)));
  }
  await db.delete(mealRules);
}

async function ids() {
  const [veg] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, "veg")).limit(1);
  const [nonveg] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, "non-veg")).limit(1);
  const sizes = await db.select({ id: mealSizes.id, planId: mealSizes.planId }).from(mealSizes).limit(2);
  return { veg: veg!.id, nonveg: nonveg!.id, sizeA: sizes[0]!.id, sizeB: sizes[1]!.id };
}

/** Insert a rule directly in the new shape (the Phase 2 builder will do this). */
async function makeRule(over: {
  scopePlanId?: bigint | null;
  scopeMealSizeId?: bigint | null;
  enabled?: boolean;
  categoryKey?: string;
}) {
  const [r] = await db
    .insert(mealRules)
    .values({
      name: "test",
      scopePlanId: over.scopePlanId ?? null,
      scopeMealSizeId: over.scopeMealSizeId ?? null,
      enabled: over.enabled ?? true,
      matchMode: "all",
      action: "max_qualifying",
      actionValue: 1,
    })
    .returning({ id: mealRules.id, publicId: mealRules.publicId });
  await db.insert(mealRuleConditions).values({
    ruleId: r!.id,
    field: "category",
    operator: "is",
    valueKeys: [over.categoryKey ?? "sabzi"],
  });
  return r!;
}

describe("rule scope", () => {
  beforeEach(reset);
  afterAll(reset);

  it("an unscoped rule applies to every plan and meal size", async () => {
    await makeRule({});
    const { veg, nonveg, sizeA } = await ids();
    expect(await mealRulesService.listEnabledForOrder({ planId: veg, mealSizeId: sizeA })).toHaveLength(1);
    expect(await mealRulesService.listEnabledForOrder({ planId: nonveg, mealSizeId: sizeA })).toHaveLength(1);
  });

  it("a plan-scoped rule applies to that plan only", async () => {
    const { veg, nonveg, sizeA } = await ids();
    await makeRule({ scopePlanId: nonveg });
    expect(await mealRulesService.listEnabledForOrder({ planId: nonveg, mealSizeId: sizeA })).toHaveLength(1);
    expect(await mealRulesService.listEnabledForOrder({ planId: veg, mealSizeId: sizeA })).toHaveLength(0);
  });

  it("a meal-size-scoped rule applies to that meal size only", async () => {
    const { veg, sizeA, sizeB } = await ids();
    await makeRule({ scopeMealSizeId: sizeA });
    expect(await mealRulesService.listEnabledForOrder({ planId: veg, mealSizeId: sizeA })).toHaveLength(1);
    expect(await mealRulesService.listEnabledForOrder({ planId: veg, mealSizeId: sizeB })).toHaveLength(0);
  });

  it("both scopes must match", async () => {
    const { veg, nonveg, sizeA, sizeB } = await ids();
    await makeRule({ scopePlanId: nonveg, scopeMealSizeId: sizeA });
    expect(await mealRulesService.listEnabledForOrder({ planId: nonveg, mealSizeId: sizeA })).toHaveLength(1);
    expect(await mealRulesService.listEnabledForOrder({ planId: veg, mealSizeId: sizeA })).toHaveLength(0);
    expect(await mealRulesService.listEnabledForOrder({ planId: nonveg, mealSizeId: sizeB })).toHaveLength(0);
  });

  it("a disabled rule is never loaded", async () => {
    const { veg, sizeA } = await ids();
    await makeRule({ enabled: false });
    expect(await mealRulesService.listEnabledForOrder({ planId: veg, mealSizeId: sizeA })).toHaveLength(0);
  });

  it("a rule with no conditions is not loaded — it would match nothing and only confuse the picker", async () => {
    const [r] = await db
      .insert(mealRules)
      .values({ name: "empty", matchMode: "all", action: "max_qualifying", actionValue: 1 })
      .returning({ id: mealRules.id });
    void r;
    const { veg, sizeA } = await ids();
    expect(await mealRulesService.listEnabledForOrder({ planId: veg, mealSizeId: sizeA })).toHaveLength(0);
  });
});

describe("legacy admin writes stay enforced", () => {
  beforeEach(reset);
  afterAll(reset);

  it("upsert through the old API produces a rule the engine can read", async () => {
    const { nonveg, sizeA } = await ids();
    await mealRulesService.upsert({
      planId: nonveg,
      categoryKey: "sabzi",
      condition: "exclusive_to_plan",
      maxCount: 1,
    });
    const [loaded] = await mealRulesService.listEnabledForOrder({ planId: nonveg, mealSizeId: sizeA });
    expect(loaded).toMatchObject({ action: "max_qualifying", actionValue: 1, matchMode: "all" });
    expect(loaded!.conditions).toHaveLength(2);
  });

  it("changing the max through the old API changes what is ENFORCED, not just what is shown", async () => {
    // maxCount is the legacy mirror; actionValue is what the engine reads. If
    // updateRule touched only the first, the admin would raise the limit and
    // enforcement would silently keep the old one.
    const { nonveg, sizeA } = await ids();
    const { publicId } = await mealRulesService.upsert({
      planId: nonveg,
      categoryKey: "sabzi",
      condition: "exclusive_to_plan",
      maxCount: 1,
    });
    await mealRulesService.updateRule(publicId, { maxCount: 3 });
    const [loaded] = await mealRulesService.listEnabledForOrder({ planId: nonveg, mealSizeId: sizeA });
    expect(loaded!.actionValue).toBe(3);
  });

  it("disabling through the old API stops the engine loading it", async () => {
    const { nonveg, sizeA } = await ids();
    const { publicId } = await mealRulesService.upsert({
      planId: nonveg,
      categoryKey: "sabzi",
      condition: "exclusive_to_plan",
      maxCount: 1,
    });
    await mealRulesService.updateRule(publicId, { enabled: false });
    expect(await mealRulesService.listEnabledForOrder({ planId: nonveg, mealSizeId: sizeA })).toHaveLength(0);
  });

  it("deleting a rule removes its conditions with it", async () => {
    const { nonveg } = await ids();
    const { publicId } = await mealRulesService.upsert({
      planId: nonveg,
      categoryKey: "sabzi",
      condition: "exclusive_to_plan",
      maxCount: 1,
    });
    const [row] = await db.select({ id: mealRules.id }).from(mealRules).where(eq(mealRules.publicId, publicId));
    await mealRulesService.deleteRule(publicId);
    const orphans = await db
      .select({ id: mealRuleConditions.id })
      .from(mealRuleConditions)
      .where(eq(mealRuleConditions.ruleId, row!.id));
    expect(orphans).toHaveLength(0);
  });

  it("re-upserting the same plan/category replaces its conditions rather than stacking them", async () => {
    const { nonveg, sizeA } = await ids();
    const input = { planId: nonveg, categoryKey: "sabzi", condition: "exclusive_to_plan" as const, maxCount: 1 };
    await mealRulesService.upsert(input);
    await mealRulesService.upsert({ ...input, maxCount: 2 });
    const loaded = await mealRulesService.listEnabledForOrder({ planId: nonveg, mealSizeId: sizeA });
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.conditions).toHaveLength(2);
    expect(loaded[0]!.actionValue).toBe(2);
  });
});

describe("builder CRUD", () => {
  beforeEach(reset);
  afterAll(reset);

  async function refs() {
    const [plan] = await db.select({ id: plans.id, publicId: plans.publicId }).from(plans).where(eq(plans.key, "non-veg")).limit(1);
    const [size] = await db.select({ publicId: mealSizes.publicId }).from(mealSizes).limit(1);
    // Creates its own dish rather than borrowing whatever the catalog seed left
    // behind — the seeded menu is replaced from time to time, and a fixture that
    // depends on it fails for reasons that have nothing to do with meal rules.
    let [dish] = await db.select({ publicId: dishes.publicId }).from(dishes).limit(1);
    if (!dish) {
      [dish] = await db
        .insert(dishes)
        .values({ name: "Rule Fixture Dish", planId: plan!.id })
        .returning({ publicId: dishes.publicId });
    }
    return { plan: plan!, size: size!, dish: dish! };
  }

  const base = {
    name: "One non-veg sabzi",
    matchMode: "all" as const,
    action: "max_qualifying" as const,
    actionValue: 1,
  };

  it("creates a rule and reads it back through the engine's loader", async () => {
    const { plan, size } = await refs();
    await mealRulesService.saveRule({
      ...base,
      scopePlanPublicId: plan.publicId,
      conditions: [
        { field: "dish_plan", operator: "is", valuePublicIds: [plan.publicId] },
        { field: "category", operator: "is", valueKeys: ["sabzi"] },
      ],
    });
    const loaded = await mealRulesService.listEnabledForOrder({ planId: plan.id, mealSizeId: null });
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.conditions).toHaveLength(2);
    void size;
  });

  it("updates a rule in place, replacing its conditions rather than adding to them", async () => {
    const { plan } = await refs();
    const { publicId } = await mealRulesService.saveRule({
      ...base,
      conditions: [{ field: "category", operator: "is", valueKeys: ["sabzi"] }],
    });
    await mealRulesService.saveRule(
      { ...base, name: "Renamed", actionValue: 2, conditions: [{ field: "category", operator: "is", valueKeys: ["rice"] }] },
      publicId,
    );
    const loaded = await mealRulesService.listEnabledForOrder({ planId: plan.id, mealSizeId: null });
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.actionValue).toBe(2);
    expect(loaded[0]!.conditions).toEqual([
      expect.objectContaining({ field: "category", valueKeys: ["rice"] }),
    ]);
  });

  it("deletes a rule", async () => {
    const { plan } = await refs();
    const { publicId } = await mealRulesService.saveRule({
      ...base,
      conditions: [{ field: "category", operator: "is", valueKeys: ["sabzi"] }],
    });
    await mealRulesService.deleteRule(publicId);
    expect(await mealRulesService.listEnabledForOrder({ planId: plan.id, mealSizeId: null })).toHaveLength(0);
  });

  it("refuses a category key that is not a real category", async () => {
    await expect(
      mealRulesService.saveRule({ ...base, conditions: [{ field: "category", operator: "is", valueKeys: ["not_a_category"] }] }),
    ).rejects.toThrow();
  });

  it("refuses a dish or diet that does not exist", async () => {
    await expect(
      mealRulesService.saveRule({ ...base, conditions: [{ field: "dish", operator: "is", valuePublicIds: ["dsh_nope"] }] }),
    ).rejects.toThrow(/dish no longer exists/i);
    await expect(
      mealRulesService.saveRule({ ...base, conditions: [{ field: "dish_plan", operator: "is", valuePublicIds: ["pln_nope"] }] }),
    ).rejects.toThrow(/diet no longer exists/i);
  });

  it("refuses a scope that does not exist", async () => {
    await expect(
      mealRulesService.saveRule({
        ...base,
        scopePlanPublicId: "pln_nope",
        conditions: [{ field: "category", operator: "is", valueKeys: ["sabzi"] }],
      }),
    ).rejects.toThrow(/plan not found/i);
  });

  it("refuses an illegal field/operator pair even though the client sent it", async () => {
    // The UI cannot build this, but a direct call must not be able to store it.
    await expect(
      mealRulesService.saveRule({
        ...base,
        conditions: [{ field: "category", operator: "contains", valueKeys: ["sabzi"] }],
      }),
    ).rejects.toThrow(/cannot be used with Category/i);
  });

  it("stores each field in its own value column", async () => {
    const { plan, dish } = await refs();
    await mealRulesService.saveRule({
      ...base,
      action: "forbid",
      actionValue: null,
      conditions: [
        { field: "dish", operator: "is_one_of", valuePublicIds: [dish.publicId] },
        { field: "dish_name", operator: "contains", valueText: "Paneer" },
      ],
    });
    const [loaded] = await mealRulesService.listEnabledForOrder({ planId: plan.id, mealSizeId: null });
    const byField = Object.fromEntries(loaded!.conditions.map((c) => [c.field, c]));
    expect(byField.dish!.valueIds).toHaveLength(1);
    expect(byField.dish!.valueKeys).toBeNull();
    expect(byField.dish_name!.valueText).toBe("Paneer");
    expect(byField.dish_name!.valueIds).toBeNull();
    expect(loaded!.action).toBe("forbid");
    expect(loaded!.actionValue).toBeNull();
  });

  it("round-trips a rule through the admin list view without exposing internal ids", async () => {
    const { plan, size } = await refs();
    await mealRulesService.saveRule({
      ...base,
      scopePlanPublicId: plan.publicId,
      scopeMealSizePublicId: size.publicId,
      description: "Only one non-veg sabzi per meal.",
      conditions: [{ field: "dish_plan", operator: "is", valuePublicIds: [plan.publicId] }],
    });
    const [row] = await mealRulesService.listBuilderRules();
    expect(row!.scopePlanPublicId).toBe(plan.publicId);
    expect(row!.scopeMealSizePublicId).toBe(size.publicId);
    expect(row!.conditions[0]!.values[0]!.publicId).toBe(plan.publicId);
    expect(row!.conditions[0]!.values[0]!.label).toBeTruthy();
  });
});
