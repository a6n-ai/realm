"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService } from "@/lib/services/menu.service";
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

export async function releaseWeek(menuWeekId: string) {
  await requireAdmin();
  await menuService.release(menuWeekId);
  revalidate();
}
