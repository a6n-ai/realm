"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ValidationError } from "@foundry/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { currentUserId } from "@/lib/services/session-service";
import { upsertPricing } from "@/lib/services/custom-meal.service";

const money = z.number().finite().transform((n) => Math.round(n * 100) / 100).pipe(z.number().positive().max(1000));
const tu = z.number().finite().transform((n) => Math.round(n * 100) / 100).pipe(z.number().positive().max(100));

const schema = z.object({
  categoryKey: z.string().trim().min(1),
  planKey: z.string().trim().min(1),
  pricePerTu: money,
  maxTu: tu.nullable(),
  active: z.boolean(),
});

export async function saveCustomMealPricing(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid pricing");
    await upsertPricing(parsed.data, await currentUserId());
    revalidatePath("/dashboard/catalog/custom-meals");
  });
}
