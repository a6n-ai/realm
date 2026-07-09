import { cutoffMsFor, ValidationError } from "@realm/commons";
import { sharedCache } from "@/lib/cache";
import { BaseRepository, UpdatableRepository } from "@realm/database";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, menuItems, menuWeeks } from "@/db/schema";
import { getAppSettings, getMealTypes } from "./app-settings.service";
import { dishCategoriesService } from "./dish-categories.service";
import type { PlanType } from "@/lib/menu/meal-types";
import type { DayOfWeek, PosterItem } from "@/lib/menu/poster";
import { SessionBaseService, SessionUpdatableService } from "./session-service";

const menuWeeksEntity = new SessionUpdatableService(new UpdatableRepository(db, menuWeeks, menuWeeks.publicId, menuWeeks.id));
const menuItemsEntity = new SessionBaseService(new BaseRepository(db, menuItems, menuItems.publicId, menuItems.id));

const publishedCache = sharedCache("published-week");

export const menuService = {
  async upsertWeek(input: { planType: PlanType; weekStart: string }) {
    // Ordering/edit locks roll per-day at cutoffHour (delivery TZ) — see
    // selectionsService. menu_weeks.orderCutoff is a NOT NULL column we keep
    // populated with a representative value (the first delivery day's cutoff),
    // derived TZ-correctly so it is never the admin's ambiguous local time.
    const { timezone, cutoffHour } = await getAppSettings();
    const cutoffMs = cutoffMsFor(input.weekStart, cutoffHour, timezone);
    const [existing] = await db.select().from(menuWeeks)
      .where(and(eq(menuWeeks.planType, input.planType), eq(menuWeeks.weekStart, input.weekStart))).limit(1);
    if (existing) return menuWeeksEntity.update(existing.publicId, { orderCutoff: cutoffMs });
    return menuWeeksEntity.create({ planType: input.planType, weekStart: input.weekStart, orderCutoff: cutoffMs });
  },

  async addItem(input: { menuWeekId: string; dayOfWeek: DayOfWeek; slot: string; dishId: string; position: number }) {
    const [week] = await db.select({ id: menuWeeks.id, planType: menuWeeks.planType }).from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
    if (!week) throw new ValidationError("Week not found");
    const allowed = new Set((await dishCategoriesService.forPlanType(week.planType as PlanType)).map((s) => s.key));
    if (!allowed.has(input.slot)) throw new ValidationError(`Slot "${input.slot}" is not configured for this plan type`);
    const [dish] = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.publicId, input.dishId)).limit(1);
    if (!dish) throw new ValidationError("Dish not found");
    const [dupe] = await db.select({ id: menuItems.id }).from(menuItems)
      .where(and(eq(menuItems.menuWeekId, week.id), eq(menuItems.dayOfWeek, input.dayOfWeek), eq(menuItems.slot, input.slot), eq(menuItems.dishId, dish.id))).limit(1);
    if (dupe) return null;
    return menuItemsEntity.create({
      menuWeekId: week.id, dayOfWeek: input.dayOfWeek, slot: input.slot, dishId: dish.id, isDefault: false, position: input.position,
    });
  },

  async removeItem(publicId: string) {
    await menuItemsEntity.delete(publicId);
  },

  async reorderItems(input: { menuWeekId: string; dayOfWeek: DayOfWeek; slot: string; orderedItemIds: string[] }) {
    // Raw bulk position update by public id; NOT audited (matches existing bulk pattern). Documented.
    await Promise.all(input.orderedItemIds.map((pid, idx) => db.update(menuItems).set({ position: idx }).where(eq(menuItems.publicId, pid))));
  },

  async setDefault(input: { itemId: string }) {
    const [item] = await db
      .select({
        id: menuItems.id,
        menuWeekId: menuItems.menuWeekId,
        dayOfWeek: menuItems.dayOfWeek,
        slot: menuItems.slot,
        isDefault: menuItems.isDefault,
        weekStatus: menuWeeks.status,
      })
      .from(menuItems)
      .innerJoin(menuWeeks, eq(menuItems.menuWeekId, menuWeeks.id))
      .where(eq(menuItems.publicId, input.itemId))
      .limit(1);
    if (!item) throw new ValidationError("Menu item not found");
    if (item.weekStatus !== "draft") throw new ValidationError("Defaults can only be set on a draft week");

    const wasDefault = item.isDefault;
    // One default per (week, day, slot); toggle off if it was already default.
    // Raw bulk update, NOT audited — matches the reorderItems pattern above.
    await db.transaction(async (tx) => {
      await tx.update(menuItems).set({ isDefault: false }).where(and(
        eq(menuItems.menuWeekId, item.menuWeekId),
        eq(menuItems.dayOfWeek, item.dayOfWeek),
        eq(menuItems.slot, item.slot),
      ));
      if (!wasDefault) {
        await tx.update(menuItems).set({ isDefault: true }).where(eq(menuItems.id, item.id));
      }
    });
  },

  async release(weekPublicId: string) {
    await menuWeeksEntity.update(weekPublicId, { status: "released", releasedAt: Date.now() });
    await publishedCache.evictAll();
  },

  // getPublishedWeek caches slots + theme per plan; callers that change either
  // (slot edits, meal-type theme) must evict so the public poster isn't stale.
  async evictPublishedCache() {
    await publishedCache.evictAll();
  },

  async listWeeks(planType: PlanType) {
    const rows = await db
      .select({
        publicId: menuWeeks.publicId,
        weekStart: menuWeeks.weekStart,
        status: menuWeeks.status,
        releasedAt: menuWeeks.releasedAt,
        itemCount: sql<number>`count(${menuItems.id})`,
      })
      .from(menuWeeks)
      .leftJoin(menuItems, eq(menuItems.menuWeekId, menuWeeks.id))
      .where(eq(menuWeeks.planType, planType))
      .groupBy(menuWeeks.id)
      .orderBy(desc(menuWeeks.weekStart));
    return rows.map((r) => ({ ...r, itemCount: Number(r.itemCount) }));
  },

  async listWeekMenus(planType: PlanType) {
    const weeks = await db
      .select({ id: menuWeeks.id, publicId: menuWeeks.publicId, weekStart: menuWeeks.weekStart, status: menuWeeks.status, releasedAt: menuWeeks.releasedAt })
      .from(menuWeeks)
      .where(eq(menuWeeks.planType, planType))
      .orderBy(desc(menuWeeks.weekStart));
    const categories = await dishCategoriesService.forPlanType(planType);
    if (weeks.length === 0) return [];
    const rows = await db
      .select({ menuWeekId: menuItems.menuWeekId, dayOfWeek: menuItems.dayOfWeek, slot: menuItems.slot, position: menuItems.position, dishName: dishes.name, diet: dishes.diet })
      .from(menuItems)
      .innerJoin(dishes, eq(menuItems.dishId, dishes.id))
      .where(inArray(menuItems.menuWeekId, weeks.map((w) => w.id)))
      .orderBy(asc(menuItems.position));
    const byWeek = new Map<bigint, PosterItem[]>();
    for (const r of rows) {
      const list = byWeek.get(r.menuWeekId) ?? [];
      list.push({ dayOfWeek: r.dayOfWeek as DayOfWeek, slot: r.slot, dishName: r.dishName, diet: r.diet, position: r.position });
      byWeek.set(r.menuWeekId, list);
    }
    return weeks.map((w) => {
      const items = byWeek.get(w.id) ?? [];
      return { publicId: w.publicId, weekStart: w.weekStart, status: w.status, releasedAt: w.releasedAt, itemCount: items.length, slots: categories, items };
    });
  },

  async weekWithItems(weekPublicId: string) {
    const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, weekPublicId)).limit(1);
    if (!week) return { week: undefined, items: [] };
    const items = await db.select().from(menuItems).where(eq(menuItems.menuWeekId, week.id)).orderBy(asc(menuItems.position));
    return { week, items };
  },

  async getPublishedWeek(planType: PlanType, weekStart?: string) {
    return publishedCache.getOrSet(`${planType}:${weekStart ?? "current"}`, async () => {
      const base = and(eq(menuWeeks.planType, planType), eq(menuWeeks.status, "released"));
      const [week] = await db.select().from(menuWeeks)
        .where(weekStart ? and(base, eq(menuWeeks.weekStart, weekStart)) : base)
        .orderBy(asc(menuWeeks.weekStart)).limit(1);
      if (!week) return null;
      const rows = await db
        .select({ dayOfWeek: menuItems.dayOfWeek, slot: menuItems.slot, position: menuItems.position, dishName: dishes.name, diet: dishes.diet })
        .from(menuItems).innerJoin(dishes, eq(menuItems.dishId, dishes.id))
        .where(eq(menuItems.menuWeekId, week.id)).orderBy(asc(menuItems.position));
      const categories = await dishCategoriesService.forPlanType(planType);
      const cfg = (await getMealTypes())[planType];
      const items: PosterItem[] = rows.map((r) => ({ dayOfWeek: r.dayOfWeek as DayOfWeek, slot: r.slot, dishName: r.dishName, diet: r.diet, position: r.position }));
      return { planType, theme: { accent: cfg.accent, titlePrefix: cfg.titlePrefix }, weekStart: week.weekStart, slots: categories, items };
    });
  },
};
