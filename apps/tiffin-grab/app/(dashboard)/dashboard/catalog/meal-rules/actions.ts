"use server";

import { MEAL_RULE_ACTIONS, MEAL_RULE_FIELDS, MEAL_RULE_MATCH_MODES, MEAL_RULE_OPERATORS } from "@/db/schema/enums";
import { z } from "zod";
import { ValidationError } from "@foundry/commons";
import type { ActionResult } from "@/lib/actions/action-result";
import { parseInput, staffAction } from "@/lib/actions/staff-action";
import { mealRulesService } from "@/lib/menu/meal-rules.service";

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

export async function saveMealRule(input: unknown): Promise<ActionResult> {
  return staffAction({ guard: "admin", revalidate: [[PATH, "layout"]] }, async () => {
    const parsed = ruleSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError("Something in this rule isn't filled in correctly.");
    const { publicId, ...rule } = parsed.data;
    await mealRulesService.saveRule(rule, publicId);
  });
}

export async function deleteMealRuleSafe(input: unknown): Promise<ActionResult> {
  return staffAction({ guard: "admin", revalidate: [[PATH, "layout"]] }, async () => {
    await mealRulesService.deleteRule(parseInput(idSchema, input).id);
  });
}
