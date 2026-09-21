"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryFrequencies, orders } from "@/db/schema";
import { assertCanManageOrder } from "@/lib/services/customer-deliveries.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import { buildMealsGrid, type GridCell } from "@/lib/menu/meals-grid";
import { AppError } from "@foundry/commons";

export type PickGrid = {
  cells: GridCell[];
  categories: { key: string; label: string; selectable: boolean; sortOrder: number }[];
  /** Menu week public id per eating date; the pick actions need it. */
  weekByDate: Record<string, string>;
  persons: number;
};

/** The meals grid for the eating days one trip covers (at most two menu weeks), trimmed so the sheet payload stays small. */
export async function loadPickGrid(orderId: string, dates: string[]): Promise<{ ok: true; grid: PickGrid | null } | { error: string }> {
  try {
    await assertCanManageOrder(orderId);
    const [row] = await db
      .select({
        id: orders.id, publicId: orders.publicId, planId: orders.planId, mealSizeId: orders.mealSizeId, persons: orders.persons,
        categoryCounts: orders.categoryCounts, mealSlots: orders.mealSlots, startDate: orders.startDate, durationWeeks: orders.durationWeeks,
      })
      .from(orders)
      .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
      .where(eq(orders.publicId, orderId))
      .limit(1);
    if (!row) return { ok: true, grid: null };
    const settings = await getAppSettings();
    const grid: PickGrid = { cells: [], categories: [], weekByDate: {}, persons: row.persons };
    for (const monday of new Set(dates.map(mondayOfIso))) {
      const r = await buildMealsGrid(row, settings, monday);
      if (r.empty !== null) continue;
      grid.categories = r.categories;
      for (const d of r.weekDatesView) if (dates.includes(d.dateIso)) grid.weekByDate[d.dateIso] = r.releasedWeek.publicId;
      grid.cells.push(...r.grid.filter((c) => dates.includes(c.dateIso)));
    }
    return { ok: true, grid: grid.cells.length ? grid : null };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
}
