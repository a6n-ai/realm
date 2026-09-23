"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError } from "@foundry/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { mealRulesService } from "@/lib/services/meal-rules.service";

const PATH = "/dashboard/catalog/meal-rules";

const upsertSchema = z.object({
  planPublicId: z.string().trim().min(1),
  categoryKey: z.string().trim().min(1),
  condition: z.literal("exclusive_to_plan"),
  maxCount: z.coerce.number().int().min(1),
  enabled: z.boolean().optional(),
});

export async function upsertMealRule(input: unknown): Promise<void> {
  await requireAdmin();
  const data = upsertSchema.parse(input);
  await mealRulesService.upsertByPlanPublicId(data);
  revalidatePath(PATH, "layout");
}

const updateSchema = z.object({
  id: z.string().trim().min(1),
  maxCount: z.coerce.number().int().min(1).optional(),
  enabled: z.boolean().optional(),
});

export async function updateMealRule(input: unknown): Promise<void> {
  await requireAdmin();
  const data = updateSchema.parse(input);
  await mealRulesService.updateRule(data.id, { maxCount: data.maxCount, enabled: data.enabled });
  revalidatePath(PATH, "layout");
}

const idSchema = z.object({ id: z.string().trim().min(1) });

export async function deleteMealRule(input: unknown): Promise<void> {
  await requireAdmin();
  const data = idSchema.parse(input);
  await mealRulesService.deleteRule(data.id);
  revalidatePath(PATH, "layout");
}

// --- Rule builder (Phase 2) -------------------------------------------------
// Shape is re-validated server-side by assertValidRuleInput inside saveRule;
// zod here only guarantees the payload is the right TYPE before it gets there.

// zod checks TYPES only. Content rules (non-empty name, value present, operator
// legal for its field) belong to assertValidRuleInput, which explains exactly
// what to fix — a zod failure here would replace that with a generic message.
const conditionSchema = z.object({
  field: z.enum(["dish_plan", "category", "dish", "dish_name"]),
  operator: z.enum([
    "is", "is_not", "is_one_of", "is_not_one_of",
    "contains", "not_contains", "equals", "starts_with", "ends_with",
  ]),
  valuePublicIds: z.array(z.string()).optional().nullable(),
  valueKeys: z.array(z.string()).optional().nullable(),
  valueText: z.string().optional().nullable(),
});

const ruleSchema = z.object({
  publicId: z.string().trim().min(1).optional(),
  name: z.string(),
  description: z.string().optional().nullable(),
  scopePlanPublicId: z.string().optional().nullable(),
  scopeMealSizePublicId: z.string().optional().nullable(),
  matchMode: z.enum(["all", "any"]),
  action: z.enum(["max_qualifying", "forbid", "cannot_coexist"]),
  actionValue: z.coerce.number().int().optional().nullable(),
  enabled: z.boolean().optional(),
  conditions: z.array(conditionSchema),
});

export type RuleSaveResult = { ok: true } | { error: string };

/**
 * RETURNS its error rather than throwing.
 *
 * This Next build redacts anything thrown across the Server Action boundary to a
 * message-less "Minified React error #441", so a thrown ValidationError reaches
 * the admin as gibberish instead of "Give the rule a name." (Same rule as
 * app/(customer)/me/action-result.ts, which documents it.)
 */
export async function saveMealRule(input: unknown): Promise<RuleSaveResult> {
  await requireAdmin();
  try {
    const { publicId, ...rule } = ruleSchema.parse(input);
    await mealRulesService.saveRule(rule, publicId);
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    if (e instanceof z.ZodError) return { error: "Something in this rule isn't filled in correctly." };
    throw e;
  }
}

export async function deleteMealRuleSafe(input: unknown): Promise<RuleSaveResult> {
  await requireAdmin();
  try {
    const data = idSchema.parse(input);
    await mealRulesService.deleteRule(data.id);
    revalidatePath(PATH, "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
}
