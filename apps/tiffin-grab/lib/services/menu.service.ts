import { cutoffMsFor, ValidationError, zonedDateIso } from "@realm/commons";
import { sharedCache } from "@/lib/cache";
import { BaseRepository, UpdatableRepository } from "@realm/database";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { dishCategories, dishPlans, dishes, mealSelections, mealSizeItems, mealSizes, menuItems, menuWeeks, organization, plans } from "@/db/schema";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import { requireCategoryIds } from "@/lib/menu/category-ids";
import { getAppSettings, getMealTypes } from "./app-settings.service";
import { dishCategoriesService } from "./dish-categories.service";
import type { DayOfWeek, PosterItem } from "@/lib/menu/poster";
import { SessionBaseService, SessionUpdatableService } from "./session-service";

const menuWeeksEntity = new SessionUpdatableService(new UpdatableRepository(db, menuWeeks, menuWeeks.publicId, menuWeeks.id));
const menuItemsEntity = new SessionBaseService(new BaseRepository(db, menuItems, menuItems.publicId, menuItems.id));

const publishedCache = sharedCache("published-week");

/** Released menu_week identity — shared by Menu poster + Deliveries calendar resolution. */
export type ReleasedWeekRef = {
  id: bigint;
  publicId: string;
  weekStart: string;
};

async function loadReleasedWeek(weekStart: string): Promise<ReleasedWeekRef | null> {
  const [week] = await db
    .select({ id: menuWeeks.id, publicId: menuWeeks.publicId, weekStart: menuWeeks.weekStart })
    .from(menuWeeks)
    .where(and(eq(menuWeeks.weekStart, weekStart), eq(menuWeeks.status, "released")))
    .limit(1);
  return week ?? null;
}

/**
 * Content edits are draft-only. The UI hid the controls on a released week, but nothing
 * server-side stopped the mutation — a stale tab or a direct action call could rewrite a
 * live menu under existing meal_selections, and a removed dish then silently resolved to
 * the day's default with the subscriber never told. Every content mutation goes through
 * assertDraft/draftWeekId so the rule cannot be forgotten at one call site.
 *
 * One message per locked state, so the UI can tell the admin what to do about it.
 */
function lockError(status: string): ValidationError {
  return status === "ready"
    ? new ValidationError("This menu is marked ready — move it back to draft to edit")
    : new ValidationError("This menu is released — edits are locked");
}

async function assertDraft(weekId: bigint) {
  const [week] = await db.select({ status: menuWeeks.status }).from(menuWeeks).where(eq(menuWeeks.id, weekId)).limit(1);
  if (!week) throw new ValidationError("Week not found");
  if (week.status !== "draft") throw lockError(week.status);
}

/** Resolve a week public id to its row id, asserting it is still editable. */
async function draftWeekId(weekPublicId: string): Promise<bigint> {
  const [week] = await db.select({ id: menuWeeks.id, status: menuWeeks.status }).from(menuWeeks)
    .where(eq(menuWeeks.publicId, weekPublicId)).limit(1);
  if (!week) throw new ValidationError("Week not found");
  if (week.status !== "draft") throw lockError(week.status);
  return week.id;
}

/**
 * One row of the builder's working copy. `id` is the menu_item public id, or null for a
 * row the admin has added but not saved yet. There is deliberately no `position`: order is
 * the array order within each (day, slot) group, assigned server-side. The old per-click
 * addItem took a client-computed position, so two fast clicks both read the same stale
 * length and collided — with position derived at save time that race cannot be expressed.
 */
export type DraftMenuItem = {
  id: string | null;
  dayOfWeek: DayOfWeek;
  slot: string;
  dishId: string;
  isDefault: boolean;
};

export type SavedMenuItem = DraftMenuItem & { id: string; position: number };

export const menuService = {
  async upsertWeek(input: { weekStart: string }) {
    // Ordering/edit locks roll per-day at cutoffHour (delivery TZ) — see
    // selectionsService. menu_weeks.orderCutoff is a NOT NULL column we keep
    // populated with a representative value (the first delivery day's cutoff),
    // derived TZ-correctly so it is never the admin's ambiguous local time.
    const { timezone, cutoffHour } = await getAppSettings();
    const cutoffMs = cutoffMsFor(input.weekStart, cutoffHour, timezone);
    const [existing] = await db.select().from(menuWeeks)
      .where(eq(menuWeeks.weekStart, input.weekStart)).limit(1);
    if (existing) return menuWeeksEntity.update(existing.publicId, { orderCutoff: cutoffMs });
    return menuWeeksEntity.create({ weekStart: input.weekStart, orderCutoff: cutoffMs });
  },

  async addItem(input: { menuWeekId: string; dayOfWeek: DayOfWeek; slot: string; dishId: string; position: number }) {
    const [week] = await db.select({ id: menuWeeks.id, status: menuWeeks.status }).from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
    if (!week) throw new ValidationError("Week not found");
    if (week.status !== "draft") throw new ValidationError("This menu is released — edits are locked");
    const allowed = new Set((await dishCategoriesService.enabledCategories()).map((s) => s.key));
    if (!allowed.has(input.slot)) throw new ValidationError(`Category "${input.slot}" is not enabled`);
    const categoryId = (await requireCategoryIds([input.slot])).get(input.slot)!;
    const [dish] = await db.select({ id: dishes.id, category: dishes.category }).from(dishes).where(eq(dishes.publicId, input.dishId)).limit(1);
    if (!dish) throw new ValidationError("Dish not found");
    // A categorized dish may only be placed in its own category's slot; a
    // null-category dish stays placeable in any slot (back-compat — I5).
    if (dish.category != null && dish.category !== input.slot) throw new ValidationError("Dish category does not match slot");
    const [dupe] = await db.select({ id: menuItems.id }).from(menuItems)
      .where(and(eq(menuItems.menuWeekId, week.id), eq(menuItems.dayOfWeek, input.dayOfWeek), eq(menuItems.categoryId, categoryId), eq(menuItems.dishId, dish.id))).limit(1);
    if (dupe) return null;
    return menuItemsEntity.create({
      menuWeekId: week.id, dayOfWeek: input.dayOfWeek, categoryId, dishId: dish.id, isDefault: false, position: input.position,
    });
  },

  async removeItem(publicId: string) {
    const [item] = await db.select({ menuWeekId: menuItems.menuWeekId }).from(menuItems).where(eq(menuItems.publicId, publicId)).limit(1);
    if (!item) throw new ValidationError("Menu item not found");
    await assertDraft(item.menuWeekId);
    await menuItemsEntity.delete(publicId);
  },

  async reorderItems(input: { menuWeekId: string; dayOfWeek: DayOfWeek; slot: string; orderedItemIds: string[] }) {
    await draftWeekId(input.menuWeekId);
    // Raw bulk position update by public id; NOT audited (matches existing bulk pattern). Documented.
    await Promise.all(input.orderedItemIds.map((pid, idx) => db.update(menuItems).set({ position: idx }).where(eq(menuItems.publicId, pid))));
  },

  async setDefault(input: { itemId: string }) {
    const [item] = await db
      .select({
        id: menuItems.id,
        menuWeekId: menuItems.menuWeekId,
        dayOfWeek: menuItems.dayOfWeek,
        categoryId: menuItems.categoryId,
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
        eq(menuItems.categoryId, item.categoryId),
      ));
      if (!wasDefault) {
        await tx.update(menuItems).set({ isDefault: true }).where(eq(menuItems.id, item.id));
      }
    });
  },

  /**
   * Persist a whole week's working copy in one transaction, diffing against what is stored.
   * This replaces the per-click addItem/removeItem/reorderItems round trips the builder used
   * to fire — those revalidated three paths and re-ran the page's whole query set on every
   * single click.
   *
   * Idempotent: saving the same list twice is a no-op. Concurrency is guarded by
   * expectedUpdatedAt — the week row is stamped under the same predicate, so a second tab
   * that loaded earlier is rejected rather than silently overwriting.
   */
  async saveWeek(input: { menuWeekId: string; expectedUpdatedAt: number; items: DraftMenuItem[]; amend?: boolean }): Promise<{ updatedAt: number; items: SavedMenuItem[]; resetPicks: number }> {
    const [week] = await db
      .select({ id: menuWeeks.id, status: menuWeeks.status })
      .from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
    if (!week) throw new ValidationError("Week not found");
    // A released week is editable only through an explicit amend, so nothing can rewrite a
    // live menu by accident. `ready` is frozen either way — it exists to be reviewed.
    if (week.status === "ready") throw lockError("ready");
    if (week.status === "released" && !input.amend) throw lockError("released");

    const allowed = new Set((await dishCategoriesService.enabledCategories()).map((s) => s.key));
    const categoryIdByKey = await requireCategoryIds(input.items.map((i) => i.slot));
    const wantedDishIds = [...new Set(input.items.map((i) => i.dishId))];
    const dishRows = wantedDishIds.length
      ? await db.select({ id: dishes.id, publicId: dishes.publicId, category: dishes.category })
          .from(dishes).where(inArray(dishes.publicId, wantedDishIds))
      : [];
    const dishByPublicId = new Map(dishRows.map((d) => [d.publicId, d]));

    // Same rules addItem enforces per click, applied to the whole list up front so a save
    // is all-or-nothing — a half-valid week must never land.
    const seenCell = new Set<string>();
    const seenDefault = new Set<string>();
    for (const item of input.items) {
      if (!allowed.has(item.slot)) throw new ValidationError(`Category "${item.slot}" is not enabled`);
      const dish = dishByPublicId.get(item.dishId);
      if (!dish) throw new ValidationError("Dish not found");
      // A categorized dish may only be placed in its own category's slot; a
      // null-category dish stays placeable in any slot (back-compat — I5).
      if (dish.category != null && dish.category !== item.slot) throw new ValidationError("Dish category does not match slot");
      const cellKey = `${item.dayOfWeek}:${item.slot}:${item.dishId}`;
      if (seenCell.has(cellKey)) throw new ValidationError("The same dish is listed twice in one day and category");
      seenCell.add(cellKey);
      if (item.isDefault) {
        const groupKey = `${item.dayOfWeek}:${item.slot}`;
        if (seenDefault.has(groupKey)) throw new ValidationError("Only one dish can be the default for a day and category");
        seenDefault.add(groupKey);
      }
    }

    const stored = await db.select({ publicId: menuItems.publicId }).from(menuItems).where(eq(menuItems.menuWeekId, week.id));
    const storedIds = new Set(stored.map((s) => s.publicId));
    for (const item of input.items) {
      if (item.id && !storedIds.has(item.id)) throw new ValidationError("A menu item no longer exists — reload the week before saving");
    }
    const keptIds = new Set(input.items.flatMap((i) => (i.id ? [i.id] : [])));
    const removedIds = stored.map((s) => s.publicId).filter((id) => !keptIds.has(id));

    // Position is the row's index within its own (day, slot) group, in the order the client
    // sent it. Derived here, never trusted from the client.
    const nextPosition = new Map<string, number>();
    const positioned = input.items.map((item) => {
      const groupKey = `${item.dayOfWeek}:${item.slot}`;
      const position = nextPosition.get(groupKey) ?? 0;
      nextPosition.set(groupKey, position + 1);
      return { ...item, position };
    });

    // Picks this save orphans. Deleting them makes the fallback to the day's default
    // explicit and auditable, instead of resolveDeliveryMeal quietly papering over a
    // dangling dish id. Computed before the transaction so the count can be reported.
    const impact = input.amend ? await this.amendImpact({ menuWeekId: input.menuWeekId, items: input.items }) : null;

    const now = Date.now();
    await db.transaction(async (tx) => {
      // Optimistic lock and the week's own timestamp bump in one statement: if another
      // session saved since this client loaded, no row matches and nothing below runs.
      const locked = await tx.update(menuWeeks).set({ updatedAt: now })
        .where(and(eq(menuWeeks.id, week.id), eq(menuWeeks.updatedAt, input.expectedUpdatedAt)))
        .returning({ id: menuWeeks.id });
      if (locked.length === 0) throw new ValidationError("This menu changed in another tab — reload before saving");

      if (impact?.brokenIds.length) await tx.delete(mealSelections).where(inArray(mealSelections.id, impact.brokenIds));

      if (removedIds.length) await tx.delete(menuItems).where(inArray(menuItems.publicId, removedIds));

      const added = positioned.filter((i) => !i.id);
      if (added.length) {
        await tx.insert(menuItems).values(added.map((i) => ({
          menuWeekId: week.id, dayOfWeek: i.dayOfWeek, categoryId: categoryIdByKey.get(i.slot)!,
          dishId: dishByPublicId.get(i.dishId)!.id, isDefault: i.isDefault, position: i.position,
        })));
      }
      // Raw bulk update, NOT audited — matches the existing reorderItems/setDefault pattern.
      for (const i of positioned) {
        if (!i.id) continue;
        await tx.update(menuItems).set({
          dayOfWeek: i.dayOfWeek, categoryId: categoryIdByKey.get(i.slot)!, dishId: dishByPublicId.get(i.dishId)!.id,
          isDefault: i.isDefault, position: i.position, updatedAt: now,
        }).where(eq(menuItems.publicId, i.id));
      }
    });

    // An amend changed a live menu, so the public poster's cached copy is now wrong.
    if (input.amend) await publishedCache.evictAll();

    // Return the persisted list so the client can adopt the new rows' ids without a
    // full page refresh — the refresh per click was the other half of the old cost.
    const [saved, freshWeek] = await Promise.all([this.weekWithItems(input.menuWeekId), db
      .select({ updatedAt: menuWeeks.updatedAt }).from(menuWeeks).where(eq(menuWeeks.id, week.id)).limit(1)]);
    const dishPublicIdById = new Map(dishRows.map((d) => [d.id, d.publicId]));
    return {
      updatedAt: freshWeek[0].updatedAt,
      resetPicks: impact?.resetPicks ?? 0,
      items: saved.items.flatMap((i) => {
        const dishId = dishPublicIdById.get(i.dishId);
        return dishId ? [{ id: i.publicId, dayOfWeek: i.dayOfWeek as DayOfWeek, slot: i.slot, dishId, isDefault: i.isDefault, position: i.position }] : [];
      }),
    };
  },

  /**
   * Duplicate a week's dishes into another week — the single biggest weekly-ops saving,
   * since most weeks are last week with a few swaps. The target must be a draft.
   */
  async copyWeek(input: { fromWeekId: string; toWeekId: string }) {
    const [from] = await db.select({ id: menuWeeks.id }).from(menuWeeks).where(eq(menuWeeks.publicId, input.fromWeekId)).limit(1);
    if (!from) throw new ValidationError("Source week not found");
    const toId = await draftWeekId(input.toWeekId);
    const source = await db.select().from(menuItems).where(eq(menuItems.menuWeekId, from.id)).orderBy(asc(menuItems.position));
    if (source.length === 0) throw new ValidationError("That week has no dishes to copy");
    await db.transaction(async (tx) => {
      await tx.delete(menuItems).where(eq(menuItems.menuWeekId, toId));
      await tx.insert(menuItems).values(source.map((i) => ({
        menuWeekId: toId, dayOfWeek: i.dayOfWeek, categoryId: i.categoryId, dishId: i.dishId,
        isDefault: i.isDefault, position: i.position,
      })));
    });
    return { copied: source.length };
  },

  /**
   * What a subscriber on a given plan would find missing if this week went live now.
   *
   * The builder shows the union of categories across a plan type, and offers dishes filtered
   * by dishes.category — but what a subscriber actually receives is filtered by dish_plans
   * membership. So an admin can fill a day that is empty for the veg plan and get no warning
   * anywhere. This is that warning, computed with the same membership the serving path uses.
   *
   * Only days that already have dishes are checked: a week that deliberately skips Sunday
   * is not an error, but a Monday built for non-veg only is.
   */
  async releaseProblems(weekPublicId: string): Promise<
    { kind: "missing" | "extra"; day: DayOfWeek; planName: string; categoryKey: string; categoryLabel: string; dishNames: string[] }[]
  > {
    const [week] = await db.select({ id: menuWeeks.id })
      .from(menuWeeks).where(eq(menuWeeks.publicId, weekPublicId)).limit(1);
    if (!week) throw new ValidationError("Week not found");

    const items = await db
      .select({ dayOfWeek: menuItems.dayOfWeek, slot: dishCategories.key, dishId: menuItems.dishId, dishName: dishes.name })
      .from(menuItems)
      .innerJoin(dishCategories, eq(dishCategories.id, menuItems.categoryId))
      .innerJoin(dishes, eq(dishes.id, menuItems.dishId))
      .where(eq(menuItems.menuWeekId, week.id));
    if (items.length === 0) return [];
    const daysWithItems = [...new Set(items.map((i) => i.dayOfWeek))] as DayOfWeek[];

    // Every active plan: one week now serves all of them, so a hole for any plan is a hole.
    const planRows = await db.select({ id: plans.id, name: plans.name })
      .from(plans).where(eq(plans.active, true));

    const problems: {
      kind: "missing" | "extra";
      day: DayOfWeek;
      planName: string;
      categoryKey: string;
      categoryLabel: string;
      dishNames: string[];
    }[] = [];
    for (const plan of planRows) {
      const [categories, requiredRows, membership] = await Promise.all([
        dishCategoriesService.forPlan(plan.id),
        // How much of each category this plan's biggest active meal size asks for. A
        // category nobody orders is not required, so it cannot block a release.
        db.select({ category: mealSizeItems.category })
          .from(mealSizeItems)
          .innerJoin(mealSizes, eq(mealSizeItems.mealSizeId, mealSizes.id))
          .where(and(eq(mealSizes.planId, plan.id), eq(mealSizes.active, true))),
        db.select({ dishId: dishPlans.dishId }).from(dishPlans).where(eq(dishPlans.planId, plan.id)),
      ]);
      const required = new Set(requiredRows.map((r) => r.category));
      const planDishIds = new Set(membership.map((m) => m.dishId));

      for (const day of daysWithItems) {
        for (const category of categories) {
          if (!required.has(category.key)) continue;
          // Plan membership first, exactly as resolveCategoriesForDay does it. That ordering
          // is why several dishes in one fixed category can be correct: one per plan. Only
          // dishes reaching the SAME plan compete, and only then is the surplus dead.
          const served = items.filter(
            (i) => i.dayOfWeek === day && i.slot === category.key && planDishIds.has(i.dishId),
          );
          if (served.length === 0) {
            problems.push({ kind: "missing", day, planName: plan.name, categoryKey: category.key, categoryLabel: category.label, dishNames: [] });
          } else if (!category.selectable && served.length > 1) {
            // A fixed category serves exactly one dish per subscriber (the default, else the
            // lowest position), so anything past the first never reaches this plan's plate.
            problems.push({
              kind: "extra",
              day,
              planName: plan.name,
              categoryKey: category.key,
              categoryLabel: category.label,
              dishNames: served.map((i) => i.dishName),
            });
          }
        }
      }
    }
    return problems;
  },

  /**
   * Customer picks this save would invalidate. A pick survives only while the dish it points
   * at is still on the menu for that exact day and category — otherwise resolveDeliveryMeal
   * silently falls back to the day's default, which is how an amend used to change what
   * somebody eats without anyone being told.
   */
  async amendImpact(input: { menuWeekId: string; items: DraftMenuItem[] }) {
    const [week] = await db.select({ id: menuWeeks.id }).from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
    if (!week) throw new ValidationError("Week not found");

    const picks = await db
      .select({ id: mealSelections.id, dayOfWeek: mealSelections.dayOfWeek, slot: dishCategories.key, orderId: mealSelections.orderId, dishPublicId: dishes.publicId })
      .from(mealSelections)
      .innerJoin(dishes, eq(mealSelections.dishId, dishes.id))
      .innerJoin(dishCategories, eq(dishCategories.id, mealSelections.categoryId))
      .where(eq(mealSelections.menuWeekId, week.id));

    const surviving = new Set(input.items.map((i) => `${i.dayOfWeek}:${i.slot}:${i.dishId}`));
    const broken = picks.filter((p) => !surviving.has(`${p.dayOfWeek}:${p.slot}:${p.dishPublicId}`));
    return {
      resetPicks: broken.length,
      affectedOrders: new Set(broken.map((p) => String(p.orderId))).size,
      days: [...new Set(broken.map((p) => p.dayOfWeek))] as DayOfWeek[],
      brokenIds: broken.map((p) => p.id),
    };
  },

  async markReady(weekPublicId: string) {
    const [week] = await db.select({ status: menuWeeks.status }).from(menuWeeks).where(eq(menuWeeks.publicId, weekPublicId)).limit(1);
    if (!week) throw new ValidationError("Week not found");
    if (week.status !== "draft") throw new ValidationError("Only a draft can be marked ready");
    await menuWeeksEntity.update(weekPublicId, { status: "ready" });
  },

  async backToDraft(weekPublicId: string) {
    const [week] = await db.select({ status: menuWeeks.status }).from(menuWeeks).where(eq(menuWeeks.publicId, weekPublicId)).limit(1);
    if (!week) throw new ValidationError("Week not found");
    if (week.status !== "ready") throw new ValidationError("Only a week marked ready can go back to draft");
    await menuWeeksEntity.update(weekPublicId, { status: "draft" });
  },

  async release(weekPublicId: string) {
    const [week] = await db.select({ status: menuWeeks.status }).from(menuWeeks).where(eq(menuWeeks.publicId, weekPublicId)).limit(1);
    if (!week) throw new ValidationError("Week not found");
    if (week.status === "released") throw new ValidationError("This menu is already released");

    const problems = await this.releaseProblems(weekPublicId);
    if (problems.length > 0) {
      const dayLabel: Record<string, string> = {
        mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
        fri: "Friday", sat: "Saturday", sun: "Sunday",
      };
      const first = problems
        .slice(0, 3)
        .map((p) => `${p.planName} has no ${p.categoryLabel} on ${dayLabel[p.day] ?? p.day}`)
        .join("; ");
      const more = problems.length > 3 ? ` (and ${problems.length - 3} more)` : "";
      throw new ValidationError(`This menu would leave subscribers without a meal: ${first}${more}`);
    }

    await menuWeeksEntity.update(weekPublicId, { status: "released", releasedAt: Date.now() });
    await publishedCache.evictAll();
  },

  // getPublishedWeek caches slots + theme per plan; callers that change either
  // (slot edits, meal-type theme) must evict so the public poster isn't stale.
  async evictPublishedCache() {
    await publishedCache.evictAll();
  },

  async listWeeks() {
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
      .groupBy(menuWeeks.id)
      .orderBy(desc(menuWeeks.weekStart));
    return rows.map((r) => ({ ...r, itemCount: Number(r.itemCount) }));
  },

  async listWeekMenus() {
    const weeks = await db
      .select({ id: menuWeeks.id, publicId: menuWeeks.publicId, weekStart: menuWeeks.weekStart, status: menuWeeks.status, releasedAt: menuWeeks.releasedAt })
      .from(menuWeeks)
      .orderBy(desc(menuWeeks.weekStart));
    const categories = await dishCategoriesService.enabledCategories();
    if (weeks.length === 0) return [];
    const rows = await db
      .select({ menuWeekId: menuItems.menuWeekId, dayOfWeek: menuItems.dayOfWeek, slot: dishCategories.key, position: menuItems.position, dishName: dishes.name })
      .from(menuItems)
      .innerJoin(dishes, eq(menuItems.dishId, dishes.id))
      .innerJoin(dishCategories, eq(dishCategories.id, menuItems.categoryId))
      .where(inArray(menuItems.menuWeekId, weeks.map((w) => w.id)))
      .orderBy(asc(menuItems.position));
    const byWeek = new Map<bigint, PosterItem[]>();
    for (const r of rows) {
      const list = byWeek.get(r.menuWeekId) ?? [];
      list.push({ dayOfWeek: r.dayOfWeek as DayOfWeek, slot: r.slot, dishName: r.dishName, position: r.position });
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
    // Explicit projection with the category key aliased back to `slot`: storage is a foreign
    // key now, but every caller above this line still works in keys.
    const items = await db
      .select({
        publicId: menuItems.publicId,
        menuWeekId: menuItems.menuWeekId,
        dayOfWeek: menuItems.dayOfWeek,
        slot: dishCategories.key,
        categoryId: menuItems.categoryId,
        dishId: menuItems.dishId,
        isDefault: menuItems.isDefault,
        position: menuItems.position,
      })
      .from(menuItems)
      .innerJoin(dishCategories, eq(dishCategories.id, menuItems.categoryId))
      .where(eq(menuItems.menuWeekId, week.id))
      .orderBy(asc(menuItems.position));
    return { week, items };
  },

  /**
   * Exact released week for a planType + weekStart (Monday ISO). Same gate Deliveries and
   * customer Menu use — never falls back to another week.
   */
  async getReleasedWeek(weekStart: string): Promise<ReleasedWeekRef | null> {
    return loadReleasedWeek(weekStart);
  },

  /** Batch of released weeks for calendar ranges; preserves exact weekStart matching. */
  async getReleasedWeeks(weekStarts: string[]): Promise<ReleasedWeekRef[]> {
    if (weekStarts.length === 0) return [];
    return db
      .select({ id: menuWeeks.id, publicId: menuWeeks.publicId, weekStart: menuWeeks.weekStart })
      .from(menuWeeks)
      .where(and(inArray(menuWeeks.weekStart, weekStarts), eq(menuWeeks.status, "released")));
  },

  /**
   * `organizationId` is the URL-resolved org from proxy.ts (Task 3/4 —
   * resolveRequestOrg). Additive alongside the existing `app_id`-scoped
   * queries below: today's single-tenant deployment has exactly one
   * organization row, so this is a no-op scoping check for now, not a
   * behavior change. A resolved id that matches no organization fails
   * closed (null), never falling through to the unscoped query.
   */
  async getPublishedWeek(weekStart?: string, organizationId?: string | null) {
    if (organizationId) {
      const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, organizationId)).limit(1);
      if (!org) return null;
    }
    return publishedCache.getOrSet(`${weekStart ?? "current"}:${organizationId ?? "-"}`, async () => {
      const base = eq(menuWeeks.status, "released");
      // Explicit weekStart → same exact-match path as getReleasedWeek (Menu/Deliveries agree).
      // No weekStart → soonest released on/after this Monday (app TZ), else latest released
      // (marketing/PDF "current poster" only — not customer calendar).
      let weekId: bigint | undefined;
      let resolvedWeekStart: string | undefined;
      if (weekStart) {
        const ref = await loadReleasedWeek(weekStart);
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
          slot: dishCategories.key,
          position: menuItems.position,
          dishName: dishes.name,
          image: dishes.image,
          dishPublicId: dishes.publicId,
        })
        .from(menuItems)
        .innerJoin(dishes, eq(menuItems.dishId, dishes.id))
        .innerJoin(dishCategories, eq(dishCategories.id, menuItems.categoryId))
        .where(eq(menuItems.menuWeekId, weekId)).orderBy(asc(menuItems.position));
      // One consolidated menu: every enabled category, and the tiffin poster theme —
      // there is a single public poster now, not one per plan type.
      const categories = await dishCategoriesService.enabledCategories();
      const cfg = (await getMealTypes()).tiffin;
      const items: PosterItem[] = rows.map((r) => ({
        dayOfWeek: r.dayOfWeek as DayOfWeek,
        slot: r.slot,
        dishName: r.dishName,
        position: r.position,
        image: r.image ?? null,
        dishPublicId: r.dishPublicId,
      }));
      return { theme: { accent: cfg.accent, titlePrefix: cfg.titlePrefix }, weekStart: resolvedWeekStart!, slots: categories, items };
    });
  },
};
