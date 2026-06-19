"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { dishesService } from "@/lib/services/dishes.service";

type DishPatch = {
  name: string;
  description: string | null;
  diet: "veg" | "nonveg";
  slots: string[];
  imageUrl: string | null;
};

export async function saveDish(id: string | null, patch: DishPatch) {
  await requireAdmin();
  const safe: DishPatch = {
    name: patch.name,
    description: patch.description,
    diet: patch.diet,
    slots: patch.slots,
    imageUrl: patch.imageUrl,
  };
  if (id) await dishesService.update(id, safe);
  else await dishesService.create(safe);
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
