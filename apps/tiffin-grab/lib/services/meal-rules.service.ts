import { ValidationError } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mealRules, plans } from "@/db/schema";
import {
  invalidMealRuleMaxMessage,
  mealRuleCategoryMessage,
} from "@/lib/menu/admin-config-guards";
import type { MealRuleRow } from "@/lib/menu/meal-validation";
import { dishCategoriesService } from "./dish-categories.service";
import { SessionUpdatableService } from "./session-service";

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
  async listEnabledForPlan(planId: bigint): Promise<MealRuleRow[]> {
    const rows = await db
      .select({
        categoryKey: mealRules.categoryKey,
        condition: mealRules.condition,
        maxCount: mealRules.maxCount,
      })
      .from(mealRules)
      .where(and(eq(mealRules.planId, planId), eq(mealRules.enabled, true)))
      .orderBy(asc(mealRules.id));
    return rows.map((r) => ({
      categoryKey: r.categoryKey,
      condition: r.condition,
      maxCount: r.maxCount,
    }));
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
    return rows;
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
    if (existing[0]) {
      await db
        .update(mealRules)
        .set({ maxCount: input.maxCount, enabled: input.enabled ?? true })
        .where(eq(mealRules.id, existing[0].id));
      return { publicId: existing[0].publicId };
    }
    const [row] = await db
      .insert(mealRules)
      .values({
        planId: input.planId,
        categoryKey: input.categoryKey,
        condition: input.condition,
        maxCount: input.maxCount,
        enabled: input.enabled ?? true,
      })
      .returning({ publicId: mealRules.publicId });
    if (!row) throw new ValidationError("Could not create meal rule");
    return row;
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
        ...(patch.maxCount != null ? { maxCount: patch.maxCount } : {}),
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
