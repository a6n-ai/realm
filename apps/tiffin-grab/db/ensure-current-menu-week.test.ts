// @vitest-environment node
/**
 * Ensures a released tiffin menu_week for app-tz "this Monday" so deliveries
 * resolve meal options (avoids "Menu not released yet" when Menu page still
 * shows an older published week).
 */
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { zonedDateIso, parseIsoDateUtc } from "@realm/commons";
import { db } from "@/db/client";
import { dishCategories, dishes, dishPlans, menuItems, menuWeeks } from "@/db/schema";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/services/menu.service";

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
      const week = await menuService.upsertWeek({ weekStart });
      const [row] = await db.select({ id: menuWeeks.id, status: menuWeeks.status }).from(menuWeeks).where(eq(menuWeeks.publicId, week.publicId)).limit(1);
      expect(row).toBeTruthy();

      // Every active dish, not a fixed list: menuService.release refuses a week that leaves
      // a plan short of a category its meal sizes promise, and the seeded catalog now has
      // one dish per required category. Placing all of them is what makes the week releasable.
      let dishRows = await db.select().from(dishes).where(eq(dishes.active, true));
      if (dishRows.length === 0) {
        // fileParallelism is off but file ORDER isn't guaranteed — several unrelated
        // suites blanket-`delete(dishes)` as part of their own per-test reset and rely
        // on the post-run reseed to restore the catalog, which hasn't run yet mid-suite.
        // Re-apply the (idempotent, NOT EXISTS/ON CONFLICT-guarded) catalog seed — via a
        // dedicated one-shot client, since seed.sql's own BEGIN/COMMIT trips drizzle's
        // db.execute() ("unsafe transaction") — so this test doesn't depend on which
        // order vitest happened to pick this run.
        const { readFileSync } = await import("node:fs");
        const { fileURLToPath } = await import("node:url");
        const postgres = (await import("postgres")).default;
        const raw = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
        try {
          await raw.unsafe(readFileSync(fileURLToPath(new URL("./seed.sql", import.meta.url)), "utf8"));
        } finally {
          await raw.end();
        }
        dishRows = await db.select().from(dishes).where(eq(dishes.active, true));
      }
      expect(dishRows.length).toBeGreaterThan(0);
      // A fixed (non-selectable) category serves exactly one dish PER PLAN — a second
      // active dish reaching the SAME plan through that category trips release()'s "extra"
      // check. Selectable categories (customer picks) are fine with several dishes overall.
      const selectableByKey = new Map(
        (await db.select({ key: dishCategories.key, selectable: dishCategories.selectable }).from(dishCategories))
          .map((c) => [c.key, c.selectable]),
      );
      const plansByDish = new Map<bigint, bigint[]>();
      for (const r of await db.select({ dishId: dishPlans.dishId, planId: dishPlans.planId }).from(dishPlans)) {
        plansByDish.set(r.dishId, [...(plansByDish.get(r.dishId) ?? []), r.planId]);
      }
      // Widest plan coverage first so one dish reaching several plans (e.g. Masala Papad:
      // veg + non-veg) claims them before a narrower dish (Egg Bhurji: non-veg only) would
      // double-book the same plan and leave a different plan uncovered.
      const orderedDishes = [...dishRows].sort(
        (a, b) => (plansByDish.get(b.id)?.length ?? 0) - (plansByDish.get(a.id)?.length ?? 0),
      );

      const existing = await db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.menuWeekId, row!.id)).limit(1);
      if (existing.length === 0) {
        for (const day of DAYS) {
          let position = 0;
          const filledPlansByFixedCategory = new Map<string, Set<bigint>>();
          for (const dish of orderedDishes) {
            const slot = dish.category ?? "curry";
            const dishPlanIds = plansByDish.get(dish.id) ?? [];
            if (!selectableByKey.get(slot)) {
              const filled = filledPlansByFixedCategory.get(slot) ?? new Set<bigint>();
              if (dishPlanIds.some((p) => filled.has(p))) continue; // would double-book a plan
              for (const p of dishPlanIds) filled.add(p);
              filledPlansByFixedCategory.set(slot, filled);
            }
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

      const pub = await menuService.getPublishedWeek(weekStart);
      expect(pub).not.toBeNull();
      expect(pub!.weekStart).toBe(weekStart);
      expect(pub!.items.length).toBeGreaterThan(0);
    }
  }, 60_000);
});
