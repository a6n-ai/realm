import { ValidationError } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealRuleConditions, mealRules, mealSizes, plans } from "@/db/schema";
import {
  invalidMealRuleMaxMessage,
  mealRuleCategoryMessage,
} from "@/lib/menu/admin-config-guards";
import type { MealRule, MealRuleCondition, MealRuleAction, MealRuleField, MealRuleOperator } from "@/lib/menu/meal-rule-types";
import { assertValidRuleInput, type RuleInput } from "@/lib/menu/meal-rule-input";
import { dishCategoriesService } from "./dish-categories.service";
import { SessionUpdatableService } from "./session-service";

export type BuilderCondition = {
  field: MealRuleField;
  operator: MealRuleOperator;
  /** Resolved dish/diet values — public id for round-tripping, label for display. */
  values: { publicId: string; label: string }[];
  valueKeys: string[];
  valueText: string | null;
};

export type BuilderRule = {
  publicId: string;
  name: string | null;
  description: string | null;
  scopePlanPublicId: string | null;
  scopePlanName: string | null;
  scopeMealSizePublicId: string | null;
  scopeMealSizeName: string | null;
  matchMode: "all" | "any";
  action: MealRuleAction;
  actionValue: number | null;
  enabled: boolean;
  conditions: BuilderCondition[];
};

async function resolvePlanId(publicId: string): Promise<bigint> {
  const [row] = await db.select({ id: plans.id }).from(plans).where(eq(plans.publicId, publicId)).limit(1);
  if (!row) throw new ValidationError("Plan not found");
  return row.id;
}

async function resolveMealSizeId(publicId: string): Promise<bigint> {
  const [row] = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.publicId, publicId)).limit(1);
  if (!row) throw new ValidationError("Meal size not found");
  return row.id;
}

export type MealRuleListItem = {
  publicId: string;
  planId: bigint;
  planPublicId: string;
  planKey: string;
  planName: string;
  categoryKey: string;
  condition: "exclusive_to_plan";
  maxCount: number;
  enabled: boolean;
};

class MealRulesService extends SessionUpdatableService<typeof mealRules> {
  /**
   * Enabled rules whose SCOPE covers this order, with their conditions.
   *
   * A NULL scope column means "every plan" / "every meal size", so the filter is
   * `is null OR equals` — a rule left unscoped must apply everywhere rather than
   * silently matching nothing.
   */
  async listEnabledForOrder(scope: { planId: bigint; mealSizeId?: bigint | null }): Promise<MealRule[]> {
    const rows = await db
      .select({
        id: mealRules.id,
        publicId: mealRules.publicId,
        name: mealRules.name,
        description: mealRules.description,
        matchMode: mealRules.matchMode,
        action: mealRules.action,
        actionValue: mealRules.actionValue,
        priority: mealRules.priority,
      })
      .from(mealRules)
      .where(
        and(
          eq(mealRules.enabled, true),
          or(isNull(mealRules.scopePlanId), eq(mealRules.scopePlanId, scope.planId)),
          scope.mealSizeId == null
            ? isNull(mealRules.scopeMealSizeId)
            : or(isNull(mealRules.scopeMealSizeId), eq(mealRules.scopeMealSizeId, scope.mealSizeId)),
        ),
      )
      .orderBy(desc(mealRules.priority), asc(mealRules.id));
    if (rows.length === 0) return [];

    const conds = await db
      .select({
        ruleId: mealRuleConditions.ruleId,
        field: mealRuleConditions.field,
        operator: mealRuleConditions.operator,
        valueIds: mealRuleConditions.valueIds,
        valueKeys: mealRuleConditions.valueKeys,
        valueText: mealRuleConditions.valueText,
      })
      .from(mealRuleConditions)
      .where(inArray(mealRuleConditions.ruleId, rows.map((r) => r.id)))
      .orderBy(asc(mealRuleConditions.id));

    const byRule = new Map<string, MealRuleCondition[]>();
    for (const c of conds) {
      const key = c.ruleId.toString();
      byRule.set(key, [...(byRule.get(key) ?? []), {
        field: c.field,
        operator: c.operator,
        valueIds: c.valueIds,
        valueKeys: c.valueKeys,
        valueText: c.valueText,
      }]);
    }

    return rows
      .map((r) => ({
        publicId: r.publicId,
        name: r.name,
        description: r.description,
        matchMode: r.matchMode,
        action: r.action,
        actionValue: r.actionValue,
        priority: r.priority,
        conditions: byRule.get(r.id.toString()) ?? [],
      }))
      // A rule with no conditions would match nothing and can only confuse the
      // picker list; writes reject it, but historical rows must not leak through.
      .filter((r) => r.conditions.length > 0);
  }

  /**
   * Admin view of the new-shape rules, with every reference resolved to a label
   * so the builder can render words instead of ids.
   */
  async listBuilderRules(): Promise<BuilderRule[]> {
    const rows = await db
      .select({
        id: mealRules.id,
        publicId: mealRules.publicId,
        name: mealRules.name,
        description: mealRules.description,
        scopePlanId: mealRules.scopePlanId,
        scopeMealSizeId: mealRules.scopeMealSizeId,
        matchMode: mealRules.matchMode,
        action: mealRules.action,
        actionValue: mealRules.actionValue,
        enabled: mealRules.enabled,
        legacyCondition: mealRules.condition,
      })
      .from(mealRules)
      .orderBy(desc(mealRules.priority), asc(mealRules.id));
    if (rows.length === 0) return [];

    const conds = await db
      .select()
      .from(mealRuleConditions)
      .where(inArray(mealRuleConditions.ruleId, rows.map((r) => r.id)))
      .orderBy(asc(mealRuleConditions.id));

    // Resolve ids -> public ids + names in one pass per table.
    const planIds = new Set<string>();
    const dishIds = new Set<string>();
    for (const c of conds) {
      for (const id of c.valueIds ?? []) (c.field === "dish_plan" ? planIds : dishIds).add(id.toString());
    }
    for (const r of rows) if (r.scopePlanId) planIds.add(r.scopePlanId.toString());

    const [planRows, dishRows, sizeRows] = await Promise.all([
      planIds.size
        ? db.select({ id: plans.id, publicId: plans.publicId, name: plans.name }).from(plans).where(inArray(plans.id, [...planIds].map(BigInt)))
        : Promise.resolve([]),
      dishIds.size
        ? db.select({ id: dishes.id, publicId: dishes.publicId, name: dishes.name }).from(dishes).where(inArray(dishes.id, [...dishIds].map(BigInt)))
        : Promise.resolve([]),
      db.select({ id: mealSizes.id, publicId: mealSizes.publicId, name: mealSizes.name }).from(mealSizes),
    ]);
    const planById = new Map(planRows.map((r) => [r.id.toString(), r]));
    const dishById = new Map(dishRows.map((r) => [r.id.toString(), r]));
    const sizeById = new Map(sizeRows.map((r) => [r.id.toString(), r]));

    const byRule = new Map<string, BuilderCondition[]>();
    for (const c of conds) {
      const resolved = (c.valueIds ?? []).flatMap((id) => {
        const hit = c.field === "dish_plan" ? planById.get(id.toString()) : dishById.get(id.toString());
        // A deleted dish/plan leaves a dangling reference; surface it rather than
        // dropping it silently, so an admin can see why a rule stopped matching.
        return hit ? [{ publicId: hit.publicId, label: hit.name }] : [{ publicId: "", label: "(deleted)" }];
      });
      const key = c.ruleId.toString();
      byRule.set(key, [...(byRule.get(key) ?? []), {
        field: c.field,
        operator: c.operator,
        values: resolved,
        valueKeys: c.valueKeys ?? [],
        valueText: c.valueText,
      }]);
    }

    return rows.map((r) => ({
      publicId: r.publicId,
      name: r.name,
      description: r.description,
      scopePlanPublicId: r.scopePlanId ? (planById.get(r.scopePlanId.toString())?.publicId ?? null) : null,
      scopePlanName: r.scopePlanId ? (planById.get(r.scopePlanId.toString())?.name ?? null) : null,
      scopeMealSizePublicId: r.scopeMealSizeId ? (sizeById.get(r.scopeMealSizeId.toString())?.publicId ?? null) : null,
      scopeMealSizeName: r.scopeMealSizeId ? (sizeById.get(r.scopeMealSizeId.toString())?.name ?? null) : null,
      matchMode: r.matchMode,
      action: r.action,
      actionValue: r.actionValue,
      enabled: r.enabled,
      conditions: byRule.get(r.id.toString()) ?? [],
    }));
  }

  /**
   * Create or replace a rule from the builder.
   *
   * Every public id is resolved here and must exist: the client is never trusted
   * for shape (assertValidRuleInput) OR for references.
   */
  async saveRule(input: RuleInput, publicId?: string): Promise<{ publicId: string }> {
    assertValidRuleInput(input);

    const scopePlanId = input.scopePlanPublicId
      ? await resolvePlanId(input.scopePlanPublicId)
      : null;
    const scopeMealSizeId = input.scopeMealSizePublicId
      ? await resolveMealSizeId(input.scopeMealSizePublicId)
      : null;

    // Category keys are soft refs; check them against the real category list so a
    // typo cannot create a rule that silently never matches.
    const validKeys = new Set((await dishCategoriesService.enabledCategories()).map((c) => c.key));
    for (const c of input.conditions) {
      if (c.field !== "category") continue;
      for (const key of c.valueKeys ?? []) {
        if (!validKeys.has(key)) throw new ValidationError(mealRuleCategoryMessage(key));
      }
    }

    // Resolve dish / plan public ids in bulk, then confirm none went missing.
    const wantedDish = new Set<string>();
    const wantedPlan = new Set<string>();
    for (const c of input.conditions) {
      for (const pid of c.valuePublicIds ?? []) (c.field === "dish" ? wantedDish : wantedPlan).add(pid);
    }
    const [dishRows, planRows] = await Promise.all([
      wantedDish.size
        ? db.select({ id: dishes.id, publicId: dishes.publicId }).from(dishes).where(inArray(dishes.publicId, [...wantedDish]))
        : Promise.resolve([]),
      wantedPlan.size
        ? db.select({ id: plans.id, publicId: plans.publicId }).from(plans).where(inArray(plans.publicId, [...wantedPlan]))
        : Promise.resolve([]),
    ]);
    const dishIdByPublic = new Map(dishRows.map((r) => [r.publicId, r.id]));
    const planIdByPublic = new Map(planRows.map((r) => [r.publicId, r.id]));
    for (const pid of wantedDish) if (!dishIdByPublic.has(pid)) throw new ValidationError("That dish no longer exists.");
    for (const pid of wantedPlan) if (!planIdByPublic.has(pid)) throw new ValidationError("That diet no longer exists.");

    return db.transaction(async (tx) => {
      const values = {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        scopePlanId,
        scopeMealSizeId,
        matchMode: input.matchMode,
        action: input.action,
        actionValue: input.action === "max_qualifying" ? (input.actionValue ?? 0) : null,
        enabled: input.enabled ?? true,
      };

      let ruleId: bigint;
      let rulePublicId: string;
      if (publicId) {
        const [row] = await tx
          .update(mealRules)
          .set(values)
          .where(eq(mealRules.publicId, publicId))
          .returning({ id: mealRules.id, publicId: mealRules.publicId });
        if (!row) throw new ValidationError("Meal rule not found");
        ruleId = row.id;
        rulePublicId = row.publicId;
      } else {
        const [row] = await tx.insert(mealRules).values(values).returning({ id: mealRules.id, publicId: mealRules.publicId });
        if (!row) throw new ValidationError("Could not create meal rule");
        ruleId = row.id;
        rulePublicId = row.publicId;
      }

      // Replace wholesale: diffing conditions buys nothing and can drift.
      await tx.delete(mealRuleConditions).where(eq(mealRuleConditions.ruleId, ruleId));
      await tx.insert(mealRuleConditions).values(
        input.conditions.map((c) => ({
          ruleId,
          field: c.field,
          operator: c.operator,
          valueIds:
            c.field === "dish"
              ? (c.valuePublicIds ?? []).map((p) => dishIdByPublic.get(p)!)
              : c.field === "dish_plan"
                ? (c.valuePublicIds ?? []).map((p) => planIdByPublic.get(p)!)
                : null,
          valueKeys: c.field === "category" ? (c.valueKeys ?? []) : null,
          valueText: c.field === "dish_name" ? (c.valueText?.trim() ?? null) : null,
        })),
      );
      return { publicId: rulePublicId };
    });
  }

  async listAll(): Promise<MealRuleListItem[]> {
    const rows = await db
      .select({
        publicId: mealRules.publicId,
        planId: mealRules.planId,
        planPublicId: plans.publicId,
        planKey: plans.key,
        planName: plans.name,
        categoryKey: mealRules.categoryKey,
        condition: mealRules.condition,
        maxCount: mealRules.maxCount,
        enabled: mealRules.enabled,
      })
      .from(mealRules)
      .innerJoin(plans, eq(plans.id, mealRules.planId))
      .orderBy(asc(plans.name), asc(mealRules.categoryKey));
    // Legacy single-condition rows only. The Phase 2 admin builder reads the new
    // header+conditions shape; until then this page keeps rendering exactly what
    // it always did, and new-shape rules simply don't appear in it.
    return rows.flatMap((r) =>
      r.planId != null && r.categoryKey != null && r.condition != null && r.maxCount != null
        ? [{ ...r, planId: r.planId, categoryKey: r.categoryKey, condition: r.condition, maxCount: r.maxCount }]
        : [],
    );
  }

  /** Create or replace by (plan, category, condition). Unique index enforces one row. */
  async upsert(input: {
    planId: bigint;
    categoryKey: string;
    condition: "exclusive_to_plan";
    maxCount: number;
    enabled?: boolean;
  }): Promise<{ publicId: string }> {
    if (!Number.isInteger(input.maxCount) || input.maxCount < 1) {
      throw new ValidationError(invalidMealRuleMaxMessage());
    }
    const planCats = await dishCategoriesService.forPlan(input.planId);
    if (!planCats.some((c) => c.key === input.categoryKey)) {
      throw new ValidationError(mealRuleCategoryMessage(input.categoryKey));
    }
    const existing = await db
      .select({ id: mealRules.id, publicId: mealRules.publicId })
      .from(mealRules)
      .where(
        and(
          eq(mealRules.planId, input.planId),
          eq(mealRules.categoryKey, input.categoryKey),
          eq(mealRules.condition, input.condition),
        ),
      )
      .limit(1);
    // Writes BOTH shapes in one transaction: the legacy columns the current admin
    // grid still reads, and the scope+conditions the engine evaluates. Without the
    // second half, a rule created from today's UI would save fine and then never
    // be enforced. The legacy half goes away with the Phase 2 builder.
    return db.transaction(async (tx) => {
      const ruleId = existing[0]
        ? (await tx
            .update(mealRules)
            .set({
              maxCount: input.maxCount,
              enabled: input.enabled ?? true,
              scopePlanId: input.planId,
              matchMode: "all",
              action: "max_qualifying",
              actionValue: input.maxCount,
            })
            .where(eq(mealRules.id, existing[0].id))
            .returning({ id: mealRules.id, publicId: mealRules.publicId }))[0]
        : (await tx
            .insert(mealRules)
            .values({
              planId: input.planId,
              categoryKey: input.categoryKey,
              condition: input.condition,
              maxCount: input.maxCount,
              enabled: input.enabled ?? true,
              scopePlanId: input.planId,
              matchMode: "all",
              action: "max_qualifying",
              actionValue: input.maxCount,
            })
            .returning({ id: mealRules.id, publicId: mealRules.publicId }))[0];
      if (!ruleId) throw new ValidationError("Could not create meal rule");

      // Replace rather than patch: the conditions are derived from the legacy
      // fields, so rewriting them is simpler than diffing and cannot drift.
      await tx.delete(mealRuleConditions).where(eq(mealRuleConditions.ruleId, ruleId.id));
      await tx.insert(mealRuleConditions).values([
        { ruleId: ruleId.id, field: "category", operator: "is", valueKeys: [input.categoryKey] },
        { ruleId: ruleId.id, field: "dish_plan", operator: "is", valueIds: [input.planId] },
      ]);
      return { publicId: ruleId.publicId };
    });
  }

  async upsertByPlanPublicId(input: {
    planPublicId: string;
    categoryKey: string;
    condition: "exclusive_to_plan";
    maxCount: number;
    enabled?: boolean;
  }): Promise<{ publicId: string }> {
    const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.publicId, input.planPublicId)).limit(1);
    if (!plan) throw new ValidationError("Plan not found");
    return this.upsert({
      planId: plan.id,
      categoryKey: input.categoryKey,
      condition: input.condition,
      maxCount: input.maxCount,
      enabled: input.enabled,
    });
  }

  async updateRule(publicId: string, patch: { maxCount?: number; enabled?: boolean }): Promise<void> {
    if (patch.maxCount != null && (!Number.isInteger(patch.maxCount) || patch.maxCount < 1)) {
      throw new ValidationError(invalidMealRuleMaxMessage());
    }
    const [row] = await db.select({ id: mealRules.id }).from(mealRules).where(eq(mealRules.publicId, publicId)).limit(1);
    if (!row) throw new ValidationError("Meal rule not found");
    await db
      .update(mealRules)
      .set({
        // actionValue is what the engine reads; maxCount is the legacy mirror the
        // old admin grid still renders. Updating one without the other would let
        // an admin raise the limit in the UI while enforcement kept the old one.
        ...(patch.maxCount != null ? { maxCount: patch.maxCount, actionValue: patch.maxCount } : {}),
        ...(patch.enabled != null ? { enabled: patch.enabled } : {}),
      })
      .where(eq(mealRules.id, row.id));
  }

  async deleteRule(publicId: string): Promise<void> {
    const deleted = await db.delete(mealRules).where(eq(mealRules.publicId, publicId)).returning({ id: mealRules.id });
    if (deleted.length === 0) throw new ValidationError("Meal rule not found");
  }
}

const repo = new UpdatableRepository(db, mealRules, mealRules.publicId, mealRules.id);
export const mealRulesService = new MealRulesService(repo);
