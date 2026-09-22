"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
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
