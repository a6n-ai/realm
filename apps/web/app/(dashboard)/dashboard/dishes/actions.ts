"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { dishesService } from "@/lib/services/dishes.service";

export async function saveDish(id: string | null, patch: Record<string, unknown>) {
  await requireAdmin();
  if (id) await dishesService.update(id, patch);
  else await dishesService.create(patch);
  revalidatePath("/dashboard/dishes");
}

export async function retireDish(id: string) {
  await requireAdmin();
  await dishesService.delete(id);
  revalidatePath("/dashboard/dishes");
}

export async function reactivateDish(id: string) {
  await requireAdmin();
  await dishesService.update(id, { active: true });
  revalidatePath("/dashboard/dishes");
}
