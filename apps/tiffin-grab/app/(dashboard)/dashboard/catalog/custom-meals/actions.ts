"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
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

export async function saveCustomMealPricing(input: unknown): Promise<void> {
  await requireAdmin();
  const data = schema.parse(input);
  await upsertPricing(data, await currentUserId());
  revalidatePath("/dashboard/catalog/custom-meals");
}
