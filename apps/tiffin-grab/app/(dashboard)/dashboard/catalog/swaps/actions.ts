"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ValidationError } from "@realm/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { categorySwapRules, mealSizes } from "@/db/schema";
import { createSwapRule, removeSwapRule as removeSwapRuleService } from "@/lib/services/category-swap-rules.service";

const PATH = "/dashboard/catalog/swaps";

const addSchema = z.object({
  mealSizePublicId: z.string().trim().min(1),
  fromCategory: z.string().trim().min(1),
  qtyFrom: z.number().int().positive(),
  toCategory: z.string().trim().min(1),
  qtyTo: z.number().int().positive(),
});

export async function addSwapRule(input: unknown): Promise<void> {
  await requireAdmin();
  const data = addSchema.parse(input);
  const [size] = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.publicId, data.mealSizePublicId)).limit(1);
  if (!size) throw new ValidationError("Meal size not found");
  await createSwapRule({
    mealSizeId: size.id,
    fromCategory: data.fromCategory,
    toCategory: data.toCategory,
    qtyFrom: data.qtyFrom,
    qtyTo: data.qtyTo,
  });
  revalidatePath(PATH, "layout");
}

const removeSchema = z.object({ id: z.string().trim().min(1) });

export async function removeSwapRule(input: unknown): Promise<void> {
  await requireAdmin();
  const data = removeSchema.parse(input);
  const [rule] = await db.select({ id: categorySwapRules.id }).from(categorySwapRules).where(eq(categorySwapRules.publicId, data.id)).limit(1);
  if (!rule) throw new ValidationError("Swap rule not found");
  await removeSwapRuleService(rule.id);
  revalidatePath(PATH, "layout");
}
