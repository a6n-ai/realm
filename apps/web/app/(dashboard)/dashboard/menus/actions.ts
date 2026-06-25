"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import type { PlanType } from "@/lib/menu/meal-types";
import { menuService } from "@/lib/services/menu.service";

export async function upsertWeek(input: { planType: PlanType; weekStart: string; orderCutoff: string }) {
  await requireAdmin();
  const week = await menuService.upsertWeek(input);
  revalidatePath("/dashboard/menus");
  return week;
}

export async function addItem(input: {
  menuWeekId: string;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  slot: string;
  dishId: string;
  position: number;
}) {
  await requireAdmin();
  const item = await menuService.addItem(input);
  revalidatePath("/dashboard/menus");
  return item;
}

export async function removeItem(id: string) {
  await requireAdmin();
  await menuService.removeItem(id);
  revalidatePath("/dashboard/menus");
}

export async function releaseWeek(menuWeekId: string) {
  await requireAdmin();
  await menuService.release(menuWeekId);
  revalidatePath("/dashboard/menus");
}
