"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService, type DraftMenuItem } from "@/lib/services/menu.service";
import { dishesService } from "@/lib/services/dishes.service";

// Draft edits are invisible to the public site — only a release changes what is served.
// Revalidating "/" and /menu/weekly on every add/remove was busting the marketing home
// page once per click for no reachable change.
function revalidate() {
  revalidatePath("/dashboard/menus");
}

function revalidatePublic() {
  revalidatePath("/dashboard/menus");
  revalidatePath("/menu/weekly");
  revalidatePath("/");
}

export async function upsertWeek(input: { weekStart: string }) {
  await requireAdmin();
  const w = await menuService.upsertWeek(input);
  revalidate();
  return { publicId: w.publicId };
}

export async function createDish(input: { name: string; category?: string | null }) {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) throw new Error("Dish name is required");
  const row = await dishesService.create({ name, description: null, category: input.category ?? null, image: null });
  revalidate();
  revalidatePath("/dashboard/catalog/dishes");
  return { publicId: row.publicId, name: row.name, category: row.category };
}

export async function saveWeek(input: { menuWeekId: string; expectedUpdatedAt: number; items: DraftMenuItem[]; amend?: boolean }) {
  await requireAdmin();
  const result = await menuService.saveWeek(input);
  // An amend rewrote a live menu, so the public pages must be revalidated too.
  if (input.amend) revalidatePublic(); else revalidate();
  return result;
}

/** What an amend would cost, for the confirm step — reads only, writes nothing. */
export async function amendImpact(input: { menuWeekId: string; items: DraftMenuItem[] }) {
  await requireAdmin();
  const { resetPicks, affectedOrders, days } = await menuService.amendImpact(input);
  return { resetPicks, affectedOrders, days };
}

export async function releaseProblems(menuWeekId: string) {
  await requireAdmin();
  return menuService.releaseProblems(menuWeekId);
}

export async function markReady(menuWeekId: string) {
  await requireAdmin();
  await menuService.markReady(menuWeekId);
  revalidate();
}

export async function backToDraft(menuWeekId: string) {
  await requireAdmin();
  await menuService.backToDraft(menuWeekId);
  revalidate();
}

export async function copyWeek(input: { fromWeekId: string; toWeekId: string }) {
  await requireAdmin();
  const result = await menuService.copyWeek(input);
  revalidate();
  return result;
}

export async function releaseWeek(menuWeekId: string) {
  await requireAdmin();
  await menuService.release(menuWeekId);
  revalidatePublic();
}
