"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";

const PATH = "/dashboard/catalog/swaps";

const addSchema = z.object({
  fromCategory: z.string().trim().min(1),
  toCategory: z.string().trim().min(1),
});

export async function addSwapPair(input: unknown): Promise<void> {
  await requireAdmin();
  const data = addSchema.parse(input);
  await dishCategoriesService.addSwapPair(data.fromCategory, data.toCategory);
  // The wizard reads this off the cached snapshot — without invalidating, a
  // new pair can take up to the cache's TTL to reach it.
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
