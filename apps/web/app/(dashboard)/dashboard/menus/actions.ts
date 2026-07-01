"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService } from "@/lib/services/menu.service";
import { dishesService } from "@/lib/services/dishes.service";
import type { PlanType } from "@/lib/menu/meal-types";
import type { DayOfWeek } from "@/lib/menu/poster";

function revalidate() {
  revalidatePath("/dashboard/menus");
  revalidatePath("/menu/weekly");
  revalidatePath("/");
}

export async function upsertWeek(input: { planType: PlanType; weekStart: string }) {
  await requireAdmin();
  const w = await menuService.upsertWeek(input);
  revalidate();
  return { publicId: w.publicId };
}

export async function addItem(input: { menuWeekId: string; dayOfWeek: DayOfWeek; slot: string; dishId: string; position: number }) {
  await requireAdmin();
  const item = await menuService.addItem(input);
  revalidate();
  return item ? { publicId: item.publicId } : null;
}

export async function removeItem(id: string) {
  await requireAdmin();
  await menuService.removeItem(id);
  revalidate();
}

export async function setDefault(itemId: string) {
  await requireAdmin();
  await menuService.setDefault({ itemId });
  revalidate();
}

export async function createDish(input: { name: string; diet: "veg" | "nonveg" }) {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) throw new Error("Dish name is required");
  const row = await dishesService.create({ name, description: null, diet: input.diet, slots: [], imageUrl: null });
  revalidate();
  revalidatePath("/dashboard/catalog/dishes");
  return { publicId: row.publicId, name: row.name, diet: row.diet as "veg" | "nonveg" };
}

export async function reorderItems(input: { menuWeekId: string; dayOfWeek: DayOfWeek; slot: string; orderedItemIds: string[] }) {
  await requireAdmin();
  await menuService.reorderItems(input);
  revalidate();
}

export async function releaseWeek(menuWeekId: string) {
  await requireAdmin();
  await menuService.release(menuWeekId);
  revalidate();
}
