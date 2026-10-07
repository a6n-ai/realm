"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";
import { currentUserId } from "@/lib/services/session-service";

const PATH = "/dashboard/catalog/swaps";

// TU to hundredths, the precision meal_size_items and receive_tu store.
const tu = z.number().finite().max(1000).transform((n) => Math.round(n * 100) / 100).pipe(z.number().positive());

// Given portion -> received portion, in TU. Empty = natural exchange.
const exchangeOverrides = z
  .array(z.object({ giveTu: tu, receiveTu: tu }))
  .max(20)
  .refine((list) => new Set(list.map((o) => o.giveTu)).size === list.length, "Each given amount can only have one override.");

// planId omitted/empty = the rule applies to every plan.
const addSchema = z.object({
  fromCategory: z.string().trim().min(1),
  toCategory: z.string().trim().min(1),
  planId: z.string().trim().min(1).nullable().optional(),
  exchangeOverrides: exchangeOverrides.optional(),
  // "Other amounts": true = natural exchange, false = not allowed.
  naturalFallback: z.boolean().optional(),
});

export async function addSwapPair(input: unknown): Promise<void> {
  await requireAdmin();
  const data = addSchema.parse(input);
  await dishCategoriesService.addSwapPair(data.fromCategory, data.toCategory, data.planId, {
    exchangeOverrides: data.exchangeOverrides,
    naturalFallback: data.naturalFallback,
    actorId: await currentUserId(),
  });
  // The wizard reads this off the cached snapshot — without invalidating, a
  // new pair can take up to the cache's TTL to reach it.
  await invalidateCatalogSnapshot();
  revalidatePath(PATH, "layout");
}

const editSchema = z.object({
  id: z.string().trim().min(1),
  fromCategory: z.string().trim().min(1),
  toCategory: z.string().trim().min(1),
  planId: z.string().trim().min(1).nullable().optional(),
  exchangeOverrides: exchangeOverrides.optional(),
  naturalFallback: z.boolean().optional(),
});

export async function editSwapPair(input: unknown): Promise<void> {
  await requireAdmin();
  const data = editSchema.parse(input);
  await dishCategoriesService.editSwapPair(data.id, data.fromCategory, data.toCategory, data.planId, {
    exchangeOverrides: data.exchangeOverrides,
    naturalFallback: data.naturalFallback,
    actorId: await currentUserId(),
  });
  await invalidateCatalogSnapshot();
  revalidatePath(PATH, "layout");
}

const removeSchema = z.object({ id: z.string().trim().min(1) });

export async function removeSwapPair(input: unknown): Promise<void> {
  await requireAdmin();
  const data = removeSchema.parse(input);
  await dishCategoriesService.removeSwapPair(data.id);
  await invalidateCatalogSnapshot();
  revalidatePath(PATH, "layout");
}
