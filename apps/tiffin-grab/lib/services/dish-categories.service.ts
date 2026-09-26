import { UpdatableRepository } from "@foundry/database";
import { ValidationError } from "@foundry/commons";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { addonCategories, addons, categoryPlans, categorySwapPairs, dishCategories, dishCategoryAddonCategories, dishes, mealSizeItems, mealSizes, plans } from "@/db/schema";
import { disabledCategoryMessage } from "@/lib/menu/admin-config-guards";
import { swapPairFits, type SwapCategory } from "@/lib/menu/swap-rules";
import { RESOURCES } from "@/app/(dashboard)/dashboard/catalog/resource-config";
import { SessionUpdatableService } from "./session-service";

// A slot shared by several plans joins once per plan; callers want it once.
function dedupeByKey<T extends { key: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
}

/** Postgres unique-violation on category_swap_pairs (from, to[, plan]) — drizzle wraps cause. */
function isDuplicateSwapPair(err: unknown): boolean {
  type PgErr = { code?: string; constraint?: string; constraint_name?: string; cause?: PgErr; message?: string };
  const layers = [err, (err as PgErr)?.cause, (err as PgErr)?.cause?.cause].filter(Boolean) as PgErr[];
  const names = ["category_swap_pairs_pair_unique", "category_swap_pairs_pair_null_plan_unique"];
  return layers.some(
    (l) =>
      (l.code === "23505" && names.some((n) => (l.constraint ?? l.constraint_name ?? "").includes(n))) ||
      (typeof l.message === "string" && names.some((n) => l.message!.includes(n))),
  );
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

  /**
   * Plan public ids per category KEY (not publicId) — the swaps admin page reads
   * category options by key, so this lets it intersect "plans that have both
   * categories" client-side without a round trip per pair.
   */
  async plansByCategoryKey(): Promise<Map<string, string[]>> {
    const rows = await db
      .select({ categoryKey: dishCategories.key, planPublicId: plans.publicId })
      .from(categoryPlans)
      .innerJoin(dishCategories, eq(dishCategories.id, categoryPlans.categoryId))
      .innerJoin(plans, eq(plans.id, categoryPlans.planId));
    const out = new Map<string, string[]>();
    for (const r of rows) out.set(r.categoryKey, [...(out.get(r.categoryKey) ?? []), r.planPublicId]);
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
      .select({
        key: dishCategories.key,
        label: dishCategories.label,
        selectable: dishCategories.selectable,
        sortOrder: dishCategories.sortOrder,
        // TU facts for admin composition hints (natural-unit readouts) — not a second ratio store.
        tuUnitType: dishCategories.tuUnitType,
        tuUnitSize: dishCategories.tuUnitSize,
        tuUnitLabel: dishCategories.tuUnitLabel,
      })
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
      .select({
        key: dishCategories.key,
        label: dishCategories.label,
        selectable: dishCategories.selectable,
        sortOrder: dishCategories.sortOrder,
        tuUnitType: dishCategories.tuUnitType,
        tuUnitSize: dishCategories.tuUnitSize,
        tuUnitLabel: dishCategories.tuUnitLabel,
      })
      .from(dishCategories)
      .where(eq(dishCategories.enabled, true))
      .orderBy(asc(dishCategories.sortOrder));
    return dedupeByKey(rows);
  }

  /**
   * Resolves (fromKey, toKey, planId) to its category_swap_pairs row id, if
   * configured at all — matching either a rule scoped to exactly this plan or
   * a null-plan ("all plans") rule.
   */
  private async findSwapPairId(fromKey: string, toKey: string, planId: bigint): Promise<bigint | null> {
    const rows = await db
      .select({ id: categorySwapPairs.id })
      .from(categorySwapPairs)
      .innerJoin(dishCategories, eq(dishCategories.id, categorySwapPairs.fromCategoryId))
      .where(and(eq(dishCategories.key, fromKey), or(isNull(categorySwapPairs.planId), eq(categorySwapPairs.planId, planId))))
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

  /** Is (fromKey, toKey) configured for planId? For idempotent seeding checks. */
  async swapPairExists(fromKey: string, toKey: string, planId: bigint): Promise<boolean> {
    return (await this.findSwapPairId(fromKey, toKey, planId)) != null;
  }

  /**
   * Is (fromKey, toKey) allowed to swap on planId? Plan-scoped eligibility
   * (category_swap_pairs row for this exact plan) plus: at least one dish
   * exists in toKey on planId — a category with no dish on this plan can't
   * receive a swap into it here, which replaces the old plans.restricted
   * direction guard.
   */
  async isSwapPairAllowed(fromKey: string, toKey: string, planId: bigint): Promise<boolean> {
    const pairId = await this.findSwapPairId(fromKey, toKey, planId);
    if (!pairId) return false;
    const [toDish] = await db.select({ id: dishes.id }).from(dishes).where(and(eq(dishes.category, toKey), eq(dishes.planId, planId))).limit(1);
    return Boolean(toDish);
  }

  async listSwapPairs() {
    // Small table, admin-only read: resolve both sides against one category
    // lookup rather than joining dish_categories twice (drizzle needs an
    // explicit alias for a self-join, more ceremony than this is worth here).
    const [pairs, cats, planRows] = await Promise.all([
      db
        .select({
          id: categorySwapPairs.id,
          publicId: categorySwapPairs.publicId,
          fromCategoryId: categorySwapPairs.fromCategoryId,
          toCategoryId: categorySwapPairs.toCategoryId,
          planId: categorySwapPairs.planId,
        })
        .from(categorySwapPairs),
      db.select({ id: dishCategories.id, key: dishCategories.key, label: dishCategories.label }).from(dishCategories),
      db.select({ id: plans.id, publicId: plans.publicId, name: plans.name }).from(plans),
    ]);
    const catById = new Map(cats.map((c) => [c.id, c]));
    const planById = new Map(planRows.map((p) => [p.id, p]));
    return pairs.map((p) => ({
      id: p.publicId,
      fromKey: catById.get(p.fromCategoryId)?.key ?? "",
      fromLabel: catById.get(p.fromCategoryId)?.label ?? "",
      toKey: catById.get(p.toCategoryId)?.key ?? "",
      toLabel: catById.get(p.toCategoryId)?.label ?? "",
      // Null = the rule applies to every plan.
      planId: p.planId == null ? null : (planById.get(p.planId)?.publicId ?? ""),
      planName: p.planId == null ? "All plans" : (planById.get(p.planId)?.name ?? ""),
    }));
  }

  /** Resolves a plan public id to its bigint id, or null when omitted ("all plans"). */
  private async resolvePlanId(planPublicId: string | null | undefined): Promise<bigint | null> {
    if (!planPublicId) return null;
    const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.publicId, planPublicId)).limit(1);
    if (!plan) throw new ValidationError("Plan not found");
    return plan.id;
  }

  async addSwapPair(fromKey: string, toKey: string, planPublicId?: string | null) {
    const [rows, planId] = await Promise.all([
      db
        .select({ key: dishCategories.key, id: dishCategories.id, enabled: dishCategories.enabled })
        .from(dishCategories)
        .where(inArray(dishCategories.key, [fromKey, toKey])),
      this.resolvePlanId(planPublicId),
    ]);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const from = byKey.get(fromKey);
    const to = byKey.get(toKey);
    if (!from || !from.enabled) throw new ValidationError(disabledCategoryMessage(fromKey));
    if (!to || !to.enabled) throw new ValidationError(disabledCategoryMessage(toKey));
    try {
      const [created] = await db
        .insert(categorySwapPairs)
        .values({ fromCategoryId: from.id, toCategoryId: to.id, planId })
        .returning();
      return created;
    } catch (e) {
      if (isDuplicateSwapPair(e)) {
        throw new ValidationError("This swap rule already exists for this direction and plan.");
      }
      throw e;
    }
  }

  /** Edits an existing swap rule's category pair and/or plan (null plan = all plans). */
  async editSwapPair(publicId: string, fromKey: string, toKey: string, planPublicId?: string | null) {
    const [rows, planId] = await Promise.all([
      db
        .select({ key: dishCategories.key, id: dishCategories.id, enabled: dishCategories.enabled })
        .from(dishCategories)
        .where(inArray(dishCategories.key, [fromKey, toKey])),
      this.resolvePlanId(planPublicId),
    ]);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const from = byKey.get(fromKey);
    const to = byKey.get(toKey);
    if (!from || !from.enabled) throw new ValidationError(disabledCategoryMessage(fromKey));
    if (!to || !to.enabled) throw new ValidationError(disabledCategoryMessage(toKey));
    try {
      const updated = await db
        .update(categorySwapPairs)
        .set({ fromCategoryId: from.id, toCategoryId: to.id, planId })
        .where(eq(categorySwapPairs.publicId, publicId))
        .returning();
      if (updated.length === 0) throw new ValidationError("Swap pair not found");
      return updated[0];
    } catch (e) {
      if (isDuplicateSwapPair(e)) {
        throw new ValidationError("This swap rule already exists for this direction and plan.");
      }
      throw e;
    }
  }

  /**
   * Swap-side facts for every enabled category on a meal size's plan: its per-pick TU
   * on this meal size (null when the composition has no row for it), unit and cap.
   * Plan membership is the gate — Curry is attached only to the non-veg plan, so a
   * veg subscriber can never swap into it.
   *
   * pickTu = FIRST meal_size_items row for that category (sortOrder); null means the
   * meal size has no row, so swapPairFits never offers it as a destination. Also the
   * receive rate for cross-unit swaps (rice ↔ roti); same-unit swaps keep given TU.
   * Give-side TU for multi-row categories comes from actual composition rows in
   * meal-validation (slotsAfterSwaps) — not from fromPicks × pickTu.
   * Multi-row compositions with different tuAmount (Sabzi 1.5 + Sabzi 1.0) remain
   * separate picks for selection; Max TU uses the simulated slot sum after swaps.
   */
  async swapCategoriesForMealSize(mealSizeId: bigint): Promise<Map<string, SwapCategory>> {
    const [size] = await db.select({ planId: mealSizes.planId }).from(mealSizes).where(eq(mealSizes.id, mealSizeId)).limit(1);
    if (!size) return new Map();
    const [cats, items] = await Promise.all([
      db
        .select({ key: dishCategories.key, unitType: dishCategories.tuUnitType, unitLabel: dishCategories.tuUnitLabel, unitSize: dishCategories.tuUnitSize, maxPicksPerTiffin: dishCategories.maxPicksPerTiffin })
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
      key: c.key, pickTu: pickTu.get(c.key) ?? null, unitType: c.unitType, unitLabel: c.unitLabel, unitSize: Number(c.unitSize), maxPicksPerTiffin: c.maxPicksPerTiffin,
    }]));
  }

  /**
   * Every plan a meal size's own composition draws dishes from — the meal
   * size's own planId plus whatever other plans its mealSizeItems rows
   * independently target (e.g. a non-veg thali with a veg-tagged Sabzi row).
   * Mirrors allowedDishIdsForMealSize in selections.service.ts, which unions
   * dishes the same way; swap eligibility must see the same set meal
   * selection does, or a rule scoped to a reachable plan silently does
   * nothing. A veg meal size's composition never references the non-veg
   * plan, so this set — and everything gated on it — stays one-directional
   * with no extra guard needed.
   */
  async reachablePlanIdsForMealSize(mealSizeId: bigint): Promise<bigint[]> {
    const rows = await db.selectDistinct({ planId: mealSizeItems.planId }).from(mealSizeItems).where(eq(mealSizeItems.mealSizeId, mealSizeId));
    return rows.map((r) => r.planId);
  }

  /**
   * Every (from, to) pair allowed on ANY plan this meal size's composition reaches:
   * a pair rule for that plan (or for all plans) AND a dish in toKey on that plan —
   * isSwapPairAllowed's rule, run for every pair and plan in four queries instead of
   * several per pair per plan. Keys are `from>to`, in pair-rule order.
   */
  private async allowedSwapPairKeys(mealSizeId: bigint): Promise<string[]> {
    const planIds = await this.reachablePlanIdsForMealSize(mealSizeId);
    if (!planIds.length) return [];
    const [pairs, cats, dishCats] = await Promise.all([
      db
        .select({ fromCategoryId: categorySwapPairs.fromCategoryId, toCategoryId: categorySwapPairs.toCategoryId, planId: categorySwapPairs.planId })
        .from(categorySwapPairs)
        .where(or(isNull(categorySwapPairs.planId), inArray(categorySwapPairs.planId, planIds)))
        .orderBy(asc(categorySwapPairs.id)),
      db.select({ id: dishCategories.id, key: dishCategories.key }).from(dishCategories),
      db.selectDistinct({ category: dishes.category, planId: dishes.planId }).from(dishes).where(inArray(dishes.planId, planIds)),
    ]);
    const keyOf = new Map(cats.map((c) => [c.id, c.key]));
    const hasDish = new Set(dishCats.map((d) => `${d.category}@${d.planId}`));
    const out = new Set<string>();
    for (const p of pairs) {
      const from = keyOf.get(p.fromCategoryId);
      const to = keyOf.get(p.toCategoryId);
      if (!from || !to) continue;
      const plansForRule = p.planId == null ? planIds : [p.planId];
      if (plansForRule.some((planId) => hasDish.has(`${to}@${planId}`))) out.add(`${from}>${to}`);
    }
    return [...out];
  }

  /** Is (fromKey, toKey) allowed to swap on ANY plan this meal size's composition reaches? */
  async isSwapPairAllowedForMealSize(fromKey: string, toKey: string, mealSizeId: bigint): Promise<boolean> {
    return (await this.allowedSwapPairKeys(mealSizeId)).includes(`${fromKey}>${toKey}`);
  }

  /** Pairs the swap drawer may offer for one meal size — the same gate applyDeliverySwap enforces. */
  async swapPairsForMealSize(mealSizeId: bigint): Promise<{ fromCategory: string; toCategory: string }[]> {
    const [cats, allowed] = await Promise.all([this.swapCategoriesForMealSize(mealSizeId), this.allowedSwapPairKeys(mealSizeId)]);
    return allowed.flatMap((k) => {
      const [fromCategory, toCategory] = k.split(">") as [string, string];
      const from = cats.get(fromCategory);
      const to = cats.get(toCategory);
      return from && to && swapPairFits(from, to) ? [{ fromCategory, toCategory }] : [];
    });
  }

  async removeSwapPair(publicId: string): Promise<void> {
    const deleted = await db.delete(categorySwapPairs).where(eq(categorySwapPairs.publicId, publicId)).returning({ id: categorySwapPairs.id });
    if (deleted.length === 0) throw new ValidationError("Swap pair not found");
  }
}

const repo = new UpdatableRepository(db, dishCategories, dishCategories.publicId, dishCategories.id);
export const dishCategoriesService = new DishCategoriesService(repo);
