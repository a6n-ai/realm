import { ValidationError } from "@tiffin/commons";
import { BaseRepository, UpdatableRepository } from "@tiffin/commons-drizzle";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSlots, menuItems, menuWeeks } from "@/db/schema";
import { SessionBaseService, SessionUpdatableService } from "./session-service";

const menuWeeksEntity = new SessionUpdatableService(
  new UpdatableRepository(db, menuWeeks, menuWeeks.publicId, menuWeeks.id),
);
const menuItemsEntity = new SessionBaseService(
  new BaseRepository(db, menuItems, menuItems.publicId, menuItems.id),
);

export const menuService = {
  async upsertWeek(input: { weekStart: string; orderCutoff: string }) {
    const cutoffMs = new Date(input.orderCutoff).getTime();
    const [existing] = await db.select().from(menuWeeks).where(eq(menuWeeks.weekStart, input.weekStart)).limit(1);
    if (existing) {
      return menuWeeksEntity.update(existing.publicId, { orderCutoff: cutoffMs });
    }
    return menuWeeksEntity.create({ weekStart: input.weekStart, orderCutoff: cutoffMs });
  },

  async addItem(input: { menuWeekId: string; dayOfWeek: "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"; slot: string; dishId: string; isDefault: boolean }) {
    const [slot] = await db.select().from(mealSlots).where(and(eq(mealSlots.key, input.slot), eq(mealSlots.enabled, true))).limit(1);
    if (!slot) throw new ValidationError("Slot is not enabled");
    const [week] = await db.select({ id: menuWeeks.id }).from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
    if (!week) throw new ValidationError("Week not found");
    const [dish] = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.publicId, input.dishId)).limit(1);
    if (!dish) throw new ValidationError("Dish not found");
    // Idempotent on the composite key: commons create() does a plain insert, so
    // check for an existing row first (preserves the old onConflictDoNothing).
    const [dupe] = await db.select({ id: menuItems.id }).from(menuItems)
      .where(and(
        eq(menuItems.menuWeekId, week.id),
        eq(menuItems.dayOfWeek, input.dayOfWeek),
        eq(menuItems.slot, input.slot),
        eq(menuItems.dishId, dish.id),
      )).limit(1);
    if (dupe) return null;
    return menuItemsEntity.create({
      menuWeekId: week.id, dayOfWeek: input.dayOfWeek, slot: input.slot, dishId: dish.id, isDefault: input.isDefault,
    });
  },

  async removeItem(publicId: string) {
    await menuItemsEntity.delete(publicId);
  },

  async setDefault(itemPublicId: string) {
    const [item] = await db.select().from(menuItems).where(eq(menuItems.publicId, itemPublicId)).limit(1);
    if (!item) throw new ValidationError("Item not found");
    // Raw bulk update by composite key (clear other defaults for this slot, then
    // set this one). No commons bulk helper this slice → NOT audited. Documented.
    await db.update(menuItems).set({ isDefault: false })
      .where(and(eq(menuItems.menuWeekId, item.menuWeekId), eq(menuItems.dayOfWeek, item.dayOfWeek), eq(menuItems.slot, item.slot)));
    await db.update(menuItems).set({ isDefault: true }).where(eq(menuItems.publicId, itemPublicId));
  },

  async release(weekPublicId: string) {
    await menuWeeksEntity.update(weekPublicId, { status: "released", releasedAt: Date.now() });
  },

  async weekWithItems(weekPublicId: string) {
    const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, weekPublicId)).limit(1);
    if (!week) return { week: undefined, items: [] };
    const items = await db.select().from(menuItems).where(eq(menuItems.menuWeekId, week.id));
    return { week, items };
  },
};
