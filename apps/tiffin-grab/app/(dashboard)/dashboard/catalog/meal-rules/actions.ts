"use server";

import { MEAL_RULE_ACTIONS, MEAL_RULE_FIELDS, MEAL_RULE_MATCH_MODES, MEAL_RULE_OPERATORS } from "@/db/schema/enums";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError } from "@foundry/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { mealRulesService } from "@/lib/services/meal-rules.service";

const PATH = "/dashboard/catalog/meal-rules";

const idSchema = z.object({ id: z.string().trim().min(1) });

// --- Rule builder (Phase 2) -------------------------------------------------
// Shape is re-validated server-side by assertValidRuleInput inside saveRule;
// zod here only guarantees the payload is the right TYPE before it gets there.

// zod checks TYPES only. Content rules (non-empty name, value present, operator
// legal for its field) belong to assertValidRuleInput, which explains exactly
// what to fix — a zod failure here would replace that with a generic message.
const conditionSchema = z.object({
  field: z.enum(MEAL_RULE_FIELDS),
  operator: z.enum(MEAL_RULE_OPERATORS),
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
  matchMode: z.enum(MEAL_RULE_MATCH_MODES),
  action: z.enum(MEAL_RULE_ACTIONS),
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
 * lib/actions/action-result.ts, which documents it.)
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
