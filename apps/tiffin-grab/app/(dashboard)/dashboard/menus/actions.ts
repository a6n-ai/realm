"use server";

import { ValidationError } from "@foundry/commons";
import { menuService, type DraftMenuItem } from "@/lib/services/menu.service";
import { dishesService } from "@/lib/services/dishes.service";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { sendMenuReminderForWeek } from "@/lib/notifications/menu-reminder";
import { menuSidesService, type DaySideValue, type SideRole } from "@/lib/services/menu-sides.service";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { revalidatePublicSite } from "@/lib/landing/revalidate-site";

// Draft edits are invisible to the public site — only a release changes what is served.
// Revalidating "/" and /menu/weekly on every add/remove was busting the marketing home
// page once per click for no reachable change.
const MENUS = { guard: "admin", revalidate: ["/dashboard/menus"] } as const;
const ADMIN = { guard: "admin" } as const;

export async function upsertWeek(input: { weekStart: string }): Promise<ActionResult<{ publicId: string }>> {
  return staffAction(MENUS, async () => {
    const w = await menuService.upsertWeek(input);
    return { publicId: w.publicId };
  });
}

export async function createDish(
  input: { name: string; category?: string | null; planId: string },
): Promise<ActionResult<{ publicId: string; name: string; category: string | null; planId: string }>> {
  return staffAction({ ...MENUS, revalidate: [...MENUS.revalidate, "/dashboard/catalog/dishes"] }, async () => {
    const name = input.name.trim();
    if (!name) throw new ValidationError("Dish name is required");
    if (!input.planId) throw new ValidationError("Plan is required");
    const row = await dishesService.create({
      name,
      description: null,
      category: input.category ?? null,
      image: null,
      planId: input.planId,
    });
    return { publicId: row.publicId, name: row.name, category: row.category, planId: input.planId };
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
  return staffAction(MENUS, async () => {
    const result = await menuService.saveWeek(input);
    if (input.amend) revalidatePublicSite();
    return result;
  });
}

/** What an amend would cost, for the confirm step — reads only, writes nothing. */
export async function amendImpact(input: {
  menuWeekId: string;
  items: DraftMenuItem[];
}): Promise<ActionResult<{ resetPicks: number; affectedOrders: number; days: string[] }>> {
  return staffAction(ADMIN, async () => {
    const { resetPicks, affectedOrders, days } = await menuService.amendImpact(input);
    return { resetPicks, affectedOrders, days };
  });
}

export async function releaseProblems(menuWeekId: string) {
  return staffAction(ADMIN, async () => ({ problems: await menuService.releaseProblems(menuWeekId) }));
}

export async function markReady(menuWeekId: string): Promise<ActionResult> {
  return staffAction(MENUS, async () => {
    await menuService.markReady(menuWeekId);
  });
}

export async function backToDraft(menuWeekId: string): Promise<ActionResult> {
  return staffAction(MENUS, async () => {
    await menuService.backToDraft(menuWeekId);
  });
}

export async function copyWeek(input: {
  fromWeekId: string;
  toWeekId: string;
}): Promise<ActionResult> {
  return staffAction(MENUS, async () => {
    await menuService.copyWeek(input);
  });
}

export async function releaseWeek(menuWeekId: string): Promise<ActionResult> {
  return staffAction(MENUS, async () => {
    await menuService.release(menuWeekId);
    revalidatePublicSite();
  });
}

/** Email every customer with a running plan that this week's menu is out. Once per customer per week. */
export async function sendWeekMenuReminder(menuWeekId: string): Promise<ActionResult<{ queued: number }>> {
  return staffAction(ADMIN, async () => {
    return sendMenuReminderForWeek(menuWeekId);
  });
}

// Side dishes: the standing source for a side role, and one menu day's override. Saved on
// their own, outside the menu draft, so they never trip the amend / customer-pick checks.
export async function setSideDefault(input: { category: string; role: SideRole; source: string | null }): Promise<ActionResult> {
  return staffAction(MENUS, async () => {
    await menuSidesService.setDefault(input);
  });
}

export async function setDaySide(input: { weekId: string; day: DayOfWeek; category: string; role: SideRole; value: DaySideValue }): Promise<ActionResult> {
  return staffAction(MENUS, async () => {
    await menuSidesService.setDay(input);
  });
}
