import { ValidationError } from "@tiffin/commons";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSlots, menuItems, menuWeeks } from "@/db/schema";

export const menuService = {
  async upsertWeek(input: { weekStart: string; orderCutoff: string }) {
    const [existing] = await db.select().from(menuWeeks).where(eq(menuWeeks.weekStart, input.weekStart)).limit(1);
    if (existing) {
      const [u] = await db.update(menuWeeks).set({ orderCutoff: new Date(input.orderCutoff) }).where(eq(menuWeeks.id, existing.id)).returning();
      return u;
    }
    const [w] = await db.insert(menuWeeks).values({ weekStart: input.weekStart, orderCutoff: new Date(input.orderCutoff) }).returning();
    return w;
  },

  async addItem(input: { menuWeekId: string; dayOfWeek: "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"; slot: string; dishId: string; isDefault: boolean }) {
    const [slot] = await db.select().from(mealSlots).where(and(eq(mealSlots.key, input.slot), eq(mealSlots.enabled, true))).limit(1);
    if (!slot) throw new ValidationError("Slot is not enabled");
    const [row] = await db.insert(menuItems).values(input).onConflictDoNothing({
      target: [menuItems.menuWeekId, menuItems.dayOfWeek, menuItems.slot, menuItems.dishId],
    }).returning();
    return row ?? null;
  },

  async removeItem(id: string) { await db.delete(menuItems).where(eq(menuItems.id, id)); },

  async setDefault(itemId: string) {
    const [item] = await db.select().from(menuItems).where(eq(menuItems.id, itemId)).limit(1);
    if (!item) throw new ValidationError("Item not found");
    await db.update(menuItems).set({ isDefault: false })
      .where(and(eq(menuItems.menuWeekId, item.menuWeekId), eq(menuItems.dayOfWeek, item.dayOfWeek), eq(menuItems.slot, item.slot)));
    await db.update(menuItems).set({ isDefault: true }).where(eq(menuItems.id, itemId));
  },

  async release(menuWeekId: string) {
    await db.update(menuWeeks).set({ status: "released", releasedAt: new Date() }).where(eq(menuWeeks.id, menuWeekId));
  },

  async weekWithItems(menuWeekId: string) {
    const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.id, menuWeekId)).limit(1);
    const items = await db.select().from(menuItems).where(eq(menuItems.menuWeekId, menuWeekId));
    return { week, items };
  },
};
