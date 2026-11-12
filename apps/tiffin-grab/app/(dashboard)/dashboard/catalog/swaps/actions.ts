"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/action-result";
import { parseInput, staffAction } from "@/lib/actions/staff-action";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { currentUserId } from "@/lib/services/session-service";

// The wizard reads swap pairs off the cached snapshot, hence catalog: true.
const SWAPS = { guard: "admin", revalidate: [["/dashboard/catalog/swaps", "layout"]], catalog: true } as const;

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
  receivesMissing: z.boolean().optional(),
  // null = every meal size on the plan.
  mealSizeId: z.string().trim().min(1).nullable().optional(),
});

export async function addSwapPair(input: unknown): Promise<ActionResult> {
  return staffAction(SWAPS, async () => {
    const data = parseInput(addSchema, input);
    await dishCategoriesService.addSwapPair(data.fromCategory, data.toCategory, data.planId, {
      exchangeOverrides: data.exchangeOverrides,
      naturalFallback: data.naturalFallback,
      receivesMissing: data.receivesMissing,
      mealSizePublicId: data.mealSizeId,
      actorId: await currentUserId(),
    });
  });
}

const editSchema = z.object({
  id: z.string().trim().min(1),
  fromCategory: z.string().trim().min(1),
  toCategory: z.string().trim().min(1),
  planId: z.string().trim().min(1).nullable().optional(),
  exchangeOverrides: exchangeOverrides.optional(),
  naturalFallback: z.boolean().optional(),
  receivesMissing: z.boolean().optional(),
  mealSizeId: z.string().trim().min(1).nullable().optional(),
});

export async function editSwapPair(input: unknown): Promise<ActionResult> {
  return staffAction(SWAPS, async () => {
    const data = parseInput(editSchema, input);
    await dishCategoriesService.editSwapPair(data.id, data.fromCategory, data.toCategory, data.planId, {
      exchangeOverrides: data.exchangeOverrides,
      naturalFallback: data.naturalFallback,
      receivesMissing: data.receivesMissing,
      mealSizePublicId: data.mealSizeId,
      actorId: await currentUserId(),
    });
  });
}

const removeSchema = z.object({ id: z.string().trim().min(1) });

export async function removeSwapPair(input: unknown): Promise<ActionResult> {
  return staffAction(SWAPS, async () => {
    await dishCategoriesService.removeSwapPair(parseInput(removeSchema, input).id);
  });
}
