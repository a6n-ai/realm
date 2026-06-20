import { ValidationError } from "@tiffin/commons";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSlots, menuItems, menuWeeks } from "@/db/schema";

export const menuService = {
  async upsertWeek(input: { weekStart: string; orderCutoff: string }) {
    const [existing] = await db.select().from(menuWeeks).where(eq(menuWeeks.weekStart, input.weekStart)).limit(1);
    const cutoffMs = new Date(input.orderCutoff).getTime();
    if (existing) {
      const [u] = await db.update(menuWeeks).set({ orderCutoff: cutoffMs }).where(eq(menuWeeks.id, existing.id)).returning();
      return u;
    }
    const [w] = await db.insert(menuWeeks).values({ weekStart: input.weekStart, orderCutoff: cutoffMs }).returning();
    return w;
  },

  async addItem(input: { menuWeekId: string; dayOfWeek: "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"; slot: string; dishId: string; isDefault: boolean }) {
    const [slot] = await db.select().from(mealSlots).where(and(eq(mealSlots.key, input.slot), eq(mealSlots.enabled, true))).limit(1);
    if (!slot) throw new ValidationError("Slot is not enabled");
    const [week] = await db.select({ id: menuWeeks.id }).from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
    if (!week) throw new ValidationError("Week not found");
    const [dish] = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.publicId, input.dishId)).limit(1);
    if (!dish) throw new ValidationError("Dish not found");
    const { dayOfWeek, slot: slotKey, isDefault } = input;
    const [row] = await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek, slot: slotKey, dishId: dish.id, isDefault }).onConflictDoNothing({
      target: [menuItems.menuWeekId, menuItems.dayOfWeek, menuItems.slot, menuItems.dishId],
    }).returning();
    return row ?? null;
  },

  async removeItem(publicId: string) {
    await db.delete(menuItems).where(eq(menuItems.publicId, publicId));
  },

  async setDefault(itemPublicId: string) {
    const [item] = await db.select().from(menuItems).where(eq(menuItems.publicId, itemPublicId)).limit(1);
    if (!item) throw new ValidationError("Item not found");
    await db.update(menuItems).set({ isDefault: false })
      .where(and(eq(menuItems.menuWeekId, item.menuWeekId), eq(menuItems.dayOfWeek, item.dayOfWeek), eq(menuItems.slot, item.slot)));
    await db.update(menuItems).set({ isDefault: true }).where(eq(menuItems.publicId, itemPublicId));
  },

  async release(weekPublicId: string) {
    const [week] = await db.select({ id: menuWeeks.id }).from(menuWeeks).where(eq(menuWeeks.publicId, weekPublicId)).limit(1);
    if (!week) throw new ValidationError("Week not found");
    await db.update(menuWeeks).set({ status: "released", releasedAt: Date.now() }).where(eq(menuWeeks.id, week.id));
  },

  async weekWithItems(weekPublicId: string) {
    const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, weekPublicId)).limit(1);
    if (!week) return { week: undefined, items: [] };
    const items = await db.select().from(menuItems).where(eq(menuItems.menuWeekId, week.id));
    return { week, items };
  },
};
