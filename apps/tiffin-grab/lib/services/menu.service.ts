import { cutoffMsFor, ValidationError, zonedDateIso } from "@realm/commons";
import { sharedCache } from "@/lib/cache";
import { BaseRepository, UpdatableRepository } from "@realm/database";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, menuItems, menuWeeks } from "@/db/schema";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import { getAppSettings, getMealTypes } from "./app-settings.service";
import { dishCategoriesService } from "./dish-categories.service";
import type { PlanType } from "@/lib/menu/meal-types";
import type { DayOfWeek, PosterItem } from "@/lib/menu/poster";
import { SessionBaseService, SessionUpdatableService } from "./session-service";

const menuWeeksEntity = new SessionUpdatableService(new UpdatableRepository(db, menuWeeks, menuWeeks.publicId, menuWeeks.id));
const menuItemsEntity = new SessionBaseService(new BaseRepository(db, menuItems, menuItems.publicId, menuItems.id));

const publishedCache = sharedCache("published-week");

/** Released menu_week identity — shared by Menu poster + Deliveries calendar resolution. */
export type ReleasedWeekRef = {
  id: bigint;
  publicId: string;
  planType: PlanType;
  weekStart: string;
};

async function loadReleasedWeek(planType: PlanType, weekStart: string): Promise<ReleasedWeekRef | null> {
  const [week] = await db
    .select({
      id: menuWeeks.id,
      publicId: menuWeeks.publicId,
      planType: menuWeeks.planType,
      weekStart: menuWeeks.weekStart,
    })
    .from(menuWeeks)
    .where(and(eq(menuWeeks.planType, planType), eq(menuWeeks.weekStart, weekStart), eq(menuWeeks.status, "released")))
    .limit(1);
  if (!week) return null;
  return { id: week.id, publicId: week.publicId, planType: week.planType as PlanType, weekStart: week.weekStart };
}

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
    const [dish] = await db.select({ id: dishes.id, category: dishes.category }).from(dishes).where(eq(dishes.publicId, input.dishId)).limit(1);
    if (!dish) throw new ValidationError("Dish not found");
    // A categorized dish may only be placed in its own category's slot; a
    // null-category dish stays placeable in any slot (back-compat — I5).
    if (dish.category != null && dish.category !== input.slot) throw new ValidationError("Dish category does not match slot");
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

  /**
   * Exact released week for a planType + weekStart (Monday ISO). Same gate Deliveries and
   * customer Menu use — never falls back to another week.
   */
  async getReleasedWeek(planType: PlanType, weekStart: string): Promise<ReleasedWeekRef | null> {
    return loadReleasedWeek(planType, weekStart);
  },

  /** Batch of released weeks for calendar ranges; preserves exact weekStart matching. */
  async getReleasedWeeks(planType: PlanType, weekStarts: string[]): Promise<ReleasedWeekRef[]> {
    if (weekStarts.length === 0) return [];
    const rows = await db
      .select({
        id: menuWeeks.id,
        publicId: menuWeeks.publicId,
        planType: menuWeeks.planType,
        weekStart: menuWeeks.weekStart,
      })
      .from(menuWeeks)
      .where(and(eq(menuWeeks.planType, planType), inArray(menuWeeks.weekStart, weekStarts), eq(menuWeeks.status, "released")));
    return rows.map((w) => ({
      id: w.id,
      publicId: w.publicId,
      planType: w.planType as PlanType,
      weekStart: w.weekStart,
    }));
  },

  async getPublishedWeek(planType: PlanType, weekStart?: string) {
    return publishedCache.getOrSet(`${planType}:${weekStart ?? "current"}`, async () => {
      const base = and(eq(menuWeeks.planType, planType), eq(menuWeeks.status, "released"));
      // Explicit weekStart → same exact-match path as getReleasedWeek (Menu/Deliveries agree).
      // No weekStart → soonest released on/after this Monday (app TZ), else latest released
      // (marketing/PDF "current poster" only — not customer calendar).
      let weekId: bigint | undefined;
      let resolvedWeekStart: string | undefined;
      if (weekStart) {
        const ref = await loadReleasedWeek(planType, weekStart);
        if (!ref) return null;
        weekId = ref.id;
        resolvedWeekStart = ref.weekStart;
      } else {
        const { timezone } = await getAppSettings();
        const thisMonday = mondayOfIso(zonedDateIso(Date.now(), timezone));
        const upcoming = await db.select({ id: menuWeeks.id, weekStart: menuWeeks.weekStart }).from(menuWeeks)
          .where(and(base, gte(menuWeeks.weekStart, thisMonday)))
          .orderBy(asc(menuWeeks.weekStart)).limit(1);
        let week = upcoming[0];
        if (!week) {
          [week] = await db.select({ id: menuWeeks.id, weekStart: menuWeeks.weekStart }).from(menuWeeks)
            .where(base).orderBy(desc(menuWeeks.weekStart)).limit(1);
        }
        if (!week) return null;
        weekId = week.id;
        resolvedWeekStart = week.weekStart;
      }
      const rows = await db
        .select({
          dayOfWeek: menuItems.dayOfWeek,
          slot: menuItems.slot,
          position: menuItems.position,
          dishName: dishes.name,
          diet: dishes.diet,
          image: dishes.image,
          dishPublicId: dishes.publicId,
        })
        .from(menuItems).innerJoin(dishes, eq(menuItems.dishId, dishes.id))
        .where(eq(menuItems.menuWeekId, weekId)).orderBy(asc(menuItems.position));
      const categories = await dishCategoriesService.forPlanType(planType);
      const cfg = (await getMealTypes())[planType];
      const items: PosterItem[] = rows.map((r) => ({
        dayOfWeek: r.dayOfWeek as DayOfWeek,
        slot: r.slot,
        dishName: r.dishName,
        diet: r.diet,
        position: r.position,
        image: r.image ?? null,
        dishPublicId: r.dishPublicId,
      }));
      return { planType, theme: { accent: cfg.accent, titlePrefix: cfg.titlePrefix }, weekStart: resolvedWeekStart!, slots: categories, items };
    });
  },
};
