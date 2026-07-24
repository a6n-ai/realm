// @vitest-environment node
/**
 * Ensures a released tiffin menu_week for app-tz "this Monday" so deliveries
 * resolve meal options (avoids "Menu not released yet" when Menu page still
 * shows an older published week).
 */
import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { zonedDateIso, parseIsoDateUtc } from "@realm/commons";
import { db } from "@/db/client";
import { dishes, menuItems, menuWeeks } from "@/db/schema";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/services/menu.service";

const DISH_NAMES = ["Dal Tadka", "Paneer Butter Masala", "Aloo Gobi", "Chicken Curry", "Egg Bhurji"] as const;
const DAYS = ["mon", "tue", "wed", "thu", "fri"] as const;

describe("ensure current menu week", () => {
  it("creates/releases this Monday's tiffin week with selectable items", async () => {
    const { timezone } = await getAppSettings();
    const today = zonedDateIso(Date.now(), timezone);
    // Also cover next Monday — QA orders often start on the coming weekday.
    const thisMonday = mondayOfIso(today);
    const nextMondayDate = parseIsoDateUtc(thisMonday);
    nextMondayDate.setUTCDate(nextMondayDate.getUTCDate() + 7);
    const weekStarts = [thisMonday, nextMondayDate.toISOString().slice(0, 10)];

    for (const weekStart of weekStarts) {
      const week = await menuService.upsertWeek({ planType: "tiffin", weekStart });
      const [row] = await db.select({ id: menuWeeks.id, status: menuWeeks.status }).from(menuWeeks).where(eq(menuWeeks.publicId, week.publicId)).limit(1);
      expect(row).toBeTruthy();

      const dishRows = await db.select().from(dishes).where(inArray(dishes.name, [...DISH_NAMES]));
      expect(dishRows.length).toBeGreaterThan(0);

      const existing = await db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.menuWeekId, row!.id)).limit(1);
      if (existing.length === 0) {
        for (const day of DAYS) {
          let position = 0;
          for (const dish of dishRows) {
            const slot = dish.category ?? "curry";
            await menuService.addItem({
              menuWeekId: week.publicId,
              dayOfWeek: day,
              slot,
              dishId: dish.publicId,
              position,
            });
            position += 1;
          }
        }
      }

      if (row!.status !== "released") {
        await menuService.release(week.publicId);
      } else {
        await menuService.evictPublishedCache();
      }

      const pub = await menuService.getPublishedWeek("tiffin", weekStart);
      expect(pub).not.toBeNull();
      expect(pub!.weekStart).toBe(weekStart);
      expect(pub!.items.length).toBeGreaterThan(0);
    }
  }, 60_000);
});
