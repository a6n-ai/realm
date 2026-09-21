"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService, type DraftMenuItem } from "@/lib/services/menu.service";
import { dishesService } from "@/lib/services/dishes.service";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";

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

// Expected ValidationErrors must be RETURNED (runAction): thrown errors are redacted
// to "Minified React error #441" in production and the builder can only show that.

export async function upsertWeek(input: { weekStart: string }): Promise<ActionResult<{ publicId: string }>> {
  await requireAdmin();
  return runAction(async () => {
    const w = await menuService.upsertWeek(input);
    revalidate();
    return { publicId: w.publicId };
  });
}

export async function createDish(
  input: { name: string; category?: string | null },
): Promise<ActionResult<{ publicId: string; name: string; category: string | null }>> {
  await requireAdmin();
  return runAction(async () => {
    const name = input.name.trim();
    if (!name) throw new ValidationError("Dish name is required");
    const row = await dishesService.create({
      name,
      description: null,
      category: input.category ?? null,
      image: null,
    });
    revalidate();
    revalidatePath("/dashboard/catalog/dishes");
    return { publicId: row.publicId, name: row.name, category: row.category };
  });
}

export async function saveWeek(input: {
  menuWeekId: string;
  expectedUpdatedAt: number;
  items: DraftMenuItem[];
  amend?: boolean;
}): Promise<
  ActionResult<{
    updatedAt: number;
    resetPicks: number;
    items: {
      id: string;
      dayOfWeek: string;
      slot: string;
      dishId: string;
      isDefault: boolean;
      position: number;
    }[];
  }>
> {
  await requireAdmin();
  return runAction(async () => {
    const result = await menuService.saveWeek(input);
    if (input.amend) revalidatePublic();
    else revalidate();
    return result;
  });
}

/** What an amend would cost, for the confirm step — reads only, writes nothing. */
export async function amendImpact(input: {
  menuWeekId: string;
  items: DraftMenuItem[];
}): Promise<ActionResult<{ resetPicks: number; affectedOrders: number; days: string[] }>> {
  await requireAdmin();
  return runAction(async () => {
    const { resetPicks, affectedOrders, days } = await menuService.amendImpact(input);
    return { resetPicks, affectedOrders, days };
  });
}

export async function releaseProblems(menuWeekId: string) {
  await requireAdmin();
  return menuService.releaseProblems(menuWeekId);
}

export async function markReady(menuWeekId: string): Promise<ActionResult> {
  await requireAdmin();
  return runAction(async () => {
    await menuService.markReady(menuWeekId);
    revalidate();
  });
}

export async function backToDraft(menuWeekId: string): Promise<ActionResult> {
  await requireAdmin();
  return runAction(async () => {
    await menuService.backToDraft(menuWeekId);
    revalidate();
  });
}

export async function copyWeek(input: {
  fromWeekId: string;
  toWeekId: string;
}): Promise<ActionResult> {
  await requireAdmin();
  return runAction(async () => {
    await menuService.copyWeek(input);
    revalidate();
  });
}

export async function releaseWeek(menuWeekId: string): Promise<ActionResult> {
  await requireAdmin();
  return runAction(async () => {
    await menuService.release(menuWeekId);
    revalidatePublic();
  });
}
