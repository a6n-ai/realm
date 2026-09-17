import { UpdatableRepository } from "@foundry/database";
import { ValidationError } from "@foundry/commons";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { addonCategories, addons, categoryPlans, categorySwapPairPlans, categorySwapPairs, dishCategories, dishCategoryAddonCategories, mealSizeItems, mealSizes, plans } from "@/db/schema";
import { swapPairFits, type SwapCategory } from "@/lib/menu/swap-rules";
import { RESOURCES } from "@/app/(dashboard)/dashboard/catalog/resource-config";
import { SessionUpdatableService } from "./session-service";

type CategoryRow = { key: string; label: string; selectable: boolean; sortOrder: number };

// A slot shared by several plans joins once per plan; callers want it once.
function dedupeByKey(rows: CategoryRow[]): CategoryRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
}

class DishCategoriesService extends SessionUpdatableService<typeof dishCategories> {
  private schema = RESOURCES["dish-categories"].schema;

  // New categories are enabled by default; retire/restore flips `enabled`.
  // planIds is membership in category_plans, not a column — split it out so the
  // generic catalog form can carry it like any other field.
  async create(values: Record<string, unknown>) {
    const { planIds, addonCategoryIds, ...rest } = this.schema.parse(values);
    const row = await super.create({ ...rest, enabled: true });
    await this.setPlans(row.publicId, planIds as string[]);
    await this.setAddonCategories(row.publicId, (addonCategoryIds ?? []) as string[]);
    return row;
  }

  async update(id: string, patch: Record<string, unknown>) {
    // The generic catalog retire/restore action toggles `active`; this table has
    // no `active` column, so map it onto `enabled` (its status column).
    if ("active" in patch) return super.update(id, { enabled: Boolean(patch.active) });
    const { planIds, addonCategoryIds, ...rest } = this.schema.partial().parse(patch);
    const row = Object.keys(rest).length ? await super.update(id, rest) : await this.read(id);
    if (planIds) await this.setPlans(id, planIds as string[]);
    if (addonCategoryIds) await this.setAddonCategories(id, addonCategoryIds as string[]);
    return row;
  }

  async delete(id: string): Promise<number> {
    await super.update(id, { enabled: false });
    return 1;
  }

  /** Replace a slot's plan membership wholesale. */
  async setPlans(categoryPublicId: string, planPublicIds: string[]) {
    const [cat] = await db
      .select({ id: dishCategories.id })
      .from(dishCategories)
      .where(eq(dishCategories.publicId, categoryPublicId))
      .limit(1);
    if (!cat) throw new ValidationError("Category not found");
    const planRows = planPublicIds.length
      ? await db.select({ id: plans.id }).from(plans).where(inArray(plans.publicId, planPublicIds))
      : [];
    if (planRows.length !== planPublicIds.length) throw new ValidationError("Unknown plan");
    await db.transaction(async (tx) => {
      await tx.delete(categoryPlans).where(eq(categoryPlans.categoryId, cat.id));
      if (planRows.length) {
        await tx.insert(categoryPlans).values(planRows.map((p) => ({ categoryId: cat.id, planId: p.id })));
      }
    });
  }

  /** Plan public ids per category, for the admin form. */
  async plansByCategory(): Promise<Map<string, string[]>> {
    const rows = await db
      .select({ categoryPublicId: dishCategories.publicId, planPublicId: plans.publicId })
      .from(categoryPlans)
      .innerJoin(dishCategories, eq(dishCategories.id, categoryPlans.categoryId))
      .innerJoin(plans, eq(plans.id, categoryPlans.planId));
    const out = new Map<string, string[]>();
    for (const r of rows) out.set(r.categoryPublicId, [...(out.get(r.categoryPublicId) ?? []), r.planPublicId]);
    return out;
  }

  /** Replace a category's add-on-category membership wholesale. Mirrors setPlans. */
  async setAddonCategories(categoryPublicId: string, addonCategoryPublicIds: string[]) {
    const [cat] = await db
      .select({ id: dishCategories.id })
      .from(dishCategories)
      .where(eq(dishCategories.publicId, categoryPublicId))
      .limit(1);
    if (!cat) throw new ValidationError("Category not found");
    const addonCatRows = addonCategoryPublicIds.length
      ? await db.select({ id: addonCategories.id }).from(addonCategories).where(inArray(addonCategories.publicId, addonCategoryPublicIds))
      : [];
    if (addonCatRows.length !== addonCategoryPublicIds.length) throw new ValidationError("Unknown add-on category");
    await db.transaction(async (tx) => {
      await tx.delete(dishCategoryAddonCategories).where(eq(dishCategoryAddonCategories.dishCategoryId, cat.id));
      if (addonCatRows.length) {
        await tx.insert(dishCategoryAddonCategories).values(addonCatRows.map((a) => ({ dishCategoryId: cat.id, addonCategoryId: a.id })));
      }
    });
  }

  /** Add-on-category public ids per dish category, for the admin form. */
  async addonCategoriesByCategory(): Promise<Map<string, string[]>> {
    const rows = await db
      .select({ categoryPublicId: dishCategories.publicId, addonCategoryPublicId: addonCategories.publicId })
      .from(dishCategoryAddonCategories)
      .innerJoin(dishCategories, eq(dishCategories.id, dishCategoryAddonCategories.dishCategoryId))
      .innerJoin(addonCategories, eq(addonCategories.id, dishCategoryAddonCategories.addonCategoryId));
    const out = new Map<string, string[]>();
    for (const r of rows) out.set(r.categoryPublicId, [...(out.get(r.categoryPublicId) ?? []), r.addonCategoryPublicId]);
    return out;
  }

  /**
   * Every attached (dish-category key -> add-on) row, unfiltered — the shape
   * loadCatalogSnapshot embeds so the wizard and pricing engine both resolve
   * add-on eligibility from the one cached snapshot instead of a per-request
   * query. Mirrors addonsForCategories but grouped, not scoped to one meal size.
   */
  async addonsByDishCategory(): Promise<Map<string, { key: string; name: string; pricePerWeek: number; maxQty: number }[]>> {
    const rows = await db
      .selectDistinct({ categoryKey: dishCategories.key, addonKey: addons.key, addonName: addons.name, pricePerWeek: addons.pricePerWeek, maxQty: addons.maxQty })
      .from(dishCategoryAddonCategories)
      .innerJoin(dishCategories, eq(dishCategories.id, dishCategoryAddonCategories.dishCategoryId))
      .innerJoin(addonCategories, eq(addonCategories.id, dishCategoryAddonCategories.addonCategoryId))
      .innerJoin(addons, eq(addons.category, addonCategories.key))
      .where(and(eq(addons.active, true), eq(addonCategories.active, true)));
    const out = new Map<string, { key: string; name: string; pricePerWeek: number; maxQty: number }[]>();
    for (const r of rows) {
      const bucket = out.get(r.categoryKey) ?? [];
      bucket.push({ key: r.addonKey, name: r.addonName, pricePerWeek: Number(r.pricePerWeek), maxQty: r.maxQty });
      out.set(r.categoryKey, bucket);
    }
    return out;
  }

  /**
   * Slots for one plan, via membership. Replaces forPlanType: plan_type could
   * only separate tiffin from healthy, so the veg and non-veg plans were stuck
   * with an identical slot list and a meal-size form could not offer the right
   * categories for the plan it was scoped to.
   */
  async forPlan(planId: bigint) {
    return db
      .select({ key: dishCategories.key, label: dishCategories.label, selectable: dishCategories.selectable, sortOrder: dishCategories.sortOrder })
      .from(dishCategories)
      .innerJoin(categoryPlans, eq(categoryPlans.categoryId, dishCategories.id))
      .where(and(eq(categoryPlans.planId, planId), eq(dishCategories.enabled, true)))
      .orderBy(asc(dishCategories.sortOrder));
  }

  /**
   * Slots for a whole menu week. A week is still tiffin-or-healthy and serves
   * every plan of that type, so this is the union of those plans' slots.
   */
  async forPlanType(planType: "tiffin" | "healthy") {
    const rows = await db
      .select({ key: dishCategories.key, label: dishCategories.label, selectable: dishCategories.selectable, sortOrder: dishCategories.sortOrder })
      .from(dishCategories)
      .innerJoin(categoryPlans, eq(categoryPlans.categoryId, dishCategories.id))
      .innerJoin(plans, eq(plans.id, categoryPlans.planId))
      .where(and(eq(plans.planType, planType), eq(dishCategories.enabled, true)))
      .orderBy(asc(dishCategories.sortOrder));
    return dedupeByKey(rows);
  }

  async enabledCategories() {
    const rows = await db
      .select({ key: dishCategories.key, label: dishCategories.label, selectable: dishCategories.selectable, sortOrder: dishCategories.sortOrder })
      .from(dishCategories)
      .where(eq(dishCategories.enabled, true))
      .orderBy(asc(dishCategories.sortOrder));
    return dedupeByKey(rows);
  }

  /** Resolves (fromKey, toKey) to its category_swap_pairs row id, if configured at all. */
  private async findSwapPairId(fromKey: string, toKey: string): Promise<bigint | null> {
    const rows = await db
      .select({ id: categorySwapPairs.id })
      .from(categorySwapPairs)
      .innerJoin(dishCategories, eq(dishCategories.id, categorySwapPairs.fromCategoryId))
      .where(eq(dishCategories.key, fromKey))
      .limit(1000);
    if (rows.length === 0) return null;
    // Two-step (rather than a single join on both sides) because we need both
    // categories resolved by key first — same tradeoff isSwapAllowed in
    // category-swaps.service.ts makes for the per-meal-size rule check.
    const [pair] = await db
      .select({ id: categorySwapPairs.id })
      .from(categorySwapPairs)
      .innerJoin(dishCategories, eq(dishCategories.id, categorySwapPairs.toCategoryId))
      .where(and(inArray(categorySwapPairs.id, rows.map((r) => r.id)), eq(dishCategories.key, toKey)))
      .limit(1);
    return pair?.id ?? null;
  }

  /** Is (fromKey, toKey) configured at all, regardless of plan restriction? For idempotent seeding checks. */
  async swapPairExists(fromKey: string, toKey: string): Promise<boolean> {
    return (await this.findSwapPairId(fromKey, toKey)) != null;
  }

  /**
   * Global guardrail: is (fromKey, toKey) allowed to swap on planId? A swap moves
   * N picks of fromKey for however many toKey picks its own tuAmount works out to
   * (see category-swaps.service.ts) — this table carries no ratio, only
   * eligibility. A pair with no category_swap_pair_plans rows is unrestricted
   * (eligible on every plan that has both categories); one or more rows scopes it
   * to just those plans.
   */
  async isSwapPairAllowed(fromKey: string, toKey: string, planId: bigint): Promise<boolean> {
    const pairId = await this.findSwapPairId(fromKey, toKey);
    if (!pairId) return false;
    const restrictions = await db.select({ planId: categorySwapPairPlans.planId }).from(categorySwapPairPlans).where(eq(categorySwapPairPlans.swapPairId, pairId));
    if (restrictions.length === 0) return true;
    return restrictions.some((r) => r.planId === planId);
  }

  async listSwapPairs() {
    // Small table, admin-only read: resolve both sides against one category
    // lookup rather than joining dish_categories twice (drizzle needs an
    // explicit alias for a self-join, more ceremony than this is worth here).
    const [pairs, cats, restrictions, allPlans] = await Promise.all([
      db.select({ id: categorySwapPairs.id, publicId: categorySwapPairs.publicId, fromCategoryId: categorySwapPairs.fromCategoryId, toCategoryId: categorySwapPairs.toCategoryId }).from(categorySwapPairs),
      db.select({ id: dishCategories.id, key: dishCategories.key, label: dishCategories.label }).from(dishCategories),
      db.select({ swapPairId: categorySwapPairPlans.swapPairId, planId: categorySwapPairPlans.planId }).from(categorySwapPairPlans),
      db.select({ id: plans.id, publicId: plans.publicId, name: plans.name }).from(plans),
    ]);
    const byId = new Map(cats.map((c) => [c.id, c]));
    const planById = new Map(allPlans.map((p) => [p.id, p]));
    const planIdsByPair = new Map<bigint, bigint[]>();
    for (const r of restrictions) planIdsByPair.set(r.swapPairId, [...(planIdsByPair.get(r.swapPairId) ?? []), r.planId]);
    return pairs.map((p) => ({
      id: p.publicId,
      fromKey: byId.get(p.fromCategoryId)?.key ?? "",
      fromLabel: byId.get(p.fromCategoryId)?.label ?? "",
      toKey: byId.get(p.toCategoryId)?.key ?? "",
      toLabel: byId.get(p.toCategoryId)?.label ?? "",
      // Empty = unrestricted (every plan with both categories).
      plans: (planIdsByPair.get(p.id) ?? []).flatMap((id) => {
        const plan = planById.get(id);
        return plan ? [{ id, publicId: plan.publicId, name: plan.name }] : [];
      }),
    }));
  }

  /**
   * Diet-direction guard: reads plans.restricted, never a hardcoded plan key
   * like "veg"/"non-veg" — generic over whatever restricted plans exist (veg,
   * halal, jain, allergen-free …), zero code change to add another one. A
   * category is "unreachable by restriction" when NONE of the plans it's
   * attached to are restricted (e.g. a category only ever offered on the
   * non-veg plan). A pair may swap INTO such a category only when it also
   * swaps FROM one, so a restricted-plan order (whose meal size never carries
   * that category in the first place) can never be offered a pair that reads
   * as "receive what this plan excludes" — the meal size scoping already
   * blocks the swap itself, this just keeps the admin's eligibility table
   * from asserting a pair that could never mean what it says. The reverse
   * (unrestricted -> restricted-reachable) is always fine.
   */
  private async isUnreachableByRestriction(categoryId: bigint): Promise<boolean> {
    const rows = await db
      .select({ restricted: plans.restricted })
      .from(categoryPlans)
      .innerJoin(plans, eq(plans.id, categoryPlans.planId))
      .where(eq(categoryPlans.categoryId, categoryId));
    return rows.length > 0 && rows.every((r) => !r.restricted);
  }

  /**
   * Same check as isUnreachableByRestriction, but for every enabled category at
   * once, by key — what the "Add pair" popup uses to warn before the admin even
   * submits, instead of only finding out from the server-side rejection.
   */
  async unreachableByRestrictionByKey(): Promise<Record<string, boolean>> {
    const rows = await db
      .select({ key: dishCategories.key, restricted: plans.restricted })
      .from(dishCategories)
      .leftJoin(categoryPlans, eq(categoryPlans.categoryId, dishCategories.id))
      .leftJoin(plans, eq(plans.id, categoryPlans.planId))
      .where(eq(dishCategories.enabled, true));
    const byKey = new Map<string, boolean[]>();
    for (const r of rows) byKey.set(r.key, [...(byKey.get(r.key) ?? []), Boolean(r.restricted)]);
    const out: Record<string, boolean> = {};
    for (const [key, flags] of byKey) out[key] = flags.length > 0 && flags.every((f) => !f);
    return out;
  }

  async addSwapPair(fromKey: string, toKey: string, planPublicIds: string[] = []) {
    if (fromKey === toKey) throw new ValidationError("A swap pair must be between two different categories");
    const rows = await db.select({ key: dishCategories.key, id: dishCategories.id }).from(dishCategories).where(inArray(dishCategories.key, [fromKey, toKey]));
    const byKey = new Map(rows.map((r) => [r.key, r.id]));
    const fromId = byKey.get(fromKey);
    const toId = byKey.get(toKey);
    if (!fromId) throw new ValidationError(`Category "${fromKey}" not found`);
    if (!toId) throw new ValidationError(`Category "${toKey}" not found`);
    const [toUnreachable, fromUnreachable] = await Promise.all([
      this.isUnreachableByRestriction(toId),
      this.isUnreachableByRestriction(fromId),
    ]);
    if (toUnreachable && !fromUnreachable) {
      throw new ValidationError(`"${toKey}" isn't offered on any restricted plan — a restricted-plan category can't swap into it`);
    }

    const planRows = planPublicIds.length
      ? await db.select({ id: plans.id }).from(plans).where(inArray(plans.publicId, planPublicIds))
      : [];
    if (planRows.length !== planPublicIds.length) throw new ValidationError("Unknown plan");
    try {
      return await db.transaction(async (tx) => {
        const [created] = await tx.insert(categorySwapPairs).values({ fromCategoryId: fromId, toCategoryId: toId }).returning();
        if (planRows.length) {
          await tx.insert(categorySwapPairPlans).values(planRows.map((p) => ({ swapPairId: created.id, planId: p.id })));
        }
        return created;
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("category_swap_pairs_pair_unique")) {
        throw new ValidationError("This pair is already configured");
      }
      throw e;
    }
  }

  /** Replace a swap pair's plan restriction wholesale. Empty = unrestricted. Mirrors setPlans. */
  async setSwapPairPlans(swapPairPublicId: string, planPublicIds: string[]) {
    const [pair] = await db.select({ id: categorySwapPairs.id }).from(categorySwapPairs).where(eq(categorySwapPairs.publicId, swapPairPublicId)).limit(1);
    if (!pair) throw new ValidationError("Swap pair not found");
    const planRows = planPublicIds.length
      ? await db.select({ id: plans.id }).from(plans).where(inArray(plans.publicId, planPublicIds))
      : [];
    if (planRows.length !== planPublicIds.length) throw new ValidationError("Unknown plan");
    await db.transaction(async (tx) => {
      await tx.delete(categorySwapPairPlans).where(eq(categorySwapPairPlans.swapPairId, pair.id));
      if (planRows.length) {
        await tx.insert(categorySwapPairPlans).values(planRows.map((p) => ({ swapPairId: pair.id, planId: p.id })));
      }
    });
  }

  /**
   * Swap-side facts for every enabled category on a meal size's plan: its per-pick TU
   * on this meal size (null when the composition has no row for it), unit and cap.
   * Plan membership is the gate — Curry is attached only to the non-veg plan, so a
   * veg subscriber can never swap into it.
   */
  async swapCategoriesForMealSize(mealSizeId: bigint): Promise<Map<string, SwapCategory>> {
    const [size] = await db.select({ planId: mealSizes.planId }).from(mealSizes).where(eq(mealSizes.id, mealSizeId)).limit(1);
    if (!size) return new Map();
    const [cats, items] = await Promise.all([
      db
        .select({ key: dishCategories.key, unitType: dishCategories.tuUnitType, unitLabel: dishCategories.tuUnitLabel, maxPicksPerTiffin: dishCategories.maxPicksPerTiffin })
        .from(dishCategories)
        .innerJoin(categoryPlans, eq(categoryPlans.categoryId, dishCategories.id))
        .where(and(eq(categoryPlans.planId, size.planId), eq(dishCategories.enabled, true))),
      db
        .select({ category: mealSizeItems.category, tuAmount: mealSizeItems.tuAmount })
        .from(mealSizeItems)
        .where(eq(mealSizeItems.mealSizeId, mealSizeId))
        .orderBy(asc(mealSizeItems.sortOrder)),
    ]);
    const pickTu = new Map<string, number>();
    for (const i of items) if (!pickTu.has(i.category)) pickTu.set(i.category, Number(i.tuAmount));
    return new Map(cats.map((c) => [c.key, {
      key: c.key, pickTu: pickTu.get(c.key) ?? null, unitType: c.unitType, unitLabel: c.unitLabel, maxPicksPerTiffin: c.maxPicksPerTiffin,
    }]));
  }

  async planIdForMealSize(mealSizeId: bigint): Promise<bigint | null> {
    const [size] = await db.select({ planId: mealSizes.planId }).from(mealSizes).where(eq(mealSizes.id, mealSizeId)).limit(1);
    return size?.planId ?? null;
  }

  /** Pairs the swap drawer may offer for one meal size — the same gate applyDeliverySwap enforces. */
  async swapPairsForMealSize(mealSizeId: bigint): Promise<{ fromCategory: string; toCategory: string }[]> {
    const [cats, all, planId] = await Promise.all([this.swapCategoriesForMealSize(mealSizeId), this.listSwapPairs(), this.planIdForMealSize(mealSizeId)]);
    return all.flatMap((p) => {
      const from = cats.get(p.fromKey);
      const to = cats.get(p.toKey);
      // Empty p.plans = unrestricted; otherwise this meal size's plan must be one of them.
      const planOk = p.plans.length === 0 || p.plans.some((pl) => pl.id === planId);
      return from && to && swapPairFits(from, to) && planOk ? [{ fromCategory: p.fromKey, toCategory: p.toKey }] : [];
    });
  }

  async removeSwapPair(publicId: string): Promise<void> {
    const deleted = await db.delete(categorySwapPairs).where(eq(categorySwapPairs.publicId, publicId)).returning({ id: categorySwapPairs.id });
    if (deleted.length === 0) throw new ValidationError("Swap pair not found");
  }
}

const repo = new UpdatableRepository(db, dishCategories, dishCategories.publicId, dishCategories.id);
export const dishCategoriesService = new DishCategoriesService(repo);
