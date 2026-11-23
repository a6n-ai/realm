import { isUniqueViolation, pgErrorLayers } from "@/lib/db/errors";
import { UpdatableRepository } from "@foundry/database";
import { ValidationError } from "@foundry/commons";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { addons, categoryPlans, categorySwapPairs, dishCategories, dishes, mealSizeItems, mealSizes, plans } from "@/db/schema";
import { disabledCategoryMessage } from "@/lib/menu/admin-config-guards";
import { swapPairFits, type ExchangeOverride, type SwapCategory, type SwapPairRule } from "@/lib/menu/swap-rules";
import { RESOURCES } from "@/lib/catalog/resource-config";
import { SessionUpdatableService } from "../services/session-service";
import type { CatalogAddon } from "@/lib/catalog/types";
import { parsePatch } from "../services/parse-patch";
import { loadMealSizeItems, tuSlotsByCategory } from "@/lib/menu/meal-size-items";
import { dishCategoryRef, invalidateDishCategories, type DishCategoryRow } from "@/lib/menu/dish-category-ref";
import { invalidateMealSizeFacts, mealSizeFacts } from "@/lib/menu/meal-size-facts";

// A slot shared by several plans joins once per plan; callers want it once.
function dedupeByKey<T extends { key: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
}

const bySortOrder = (rows: DishCategoryRow[]) => [...rows].sort((a, b) => a.sortOrder - b.sortOrder);

/** Postgres unique-violation on category_swap_pairs (from, to[, plan[, meal size]]) — drizzle wraps cause. */
function isDuplicateSwapPair(err: unknown): boolean {
  const names = ["category_swap_pairs_pair_unique", "category_swap_pairs_pair_null_plan_unique", "category_swap_pairs_pair_meal_size_unique"];
  return isUniqueViolation(err, names) || pgErrorLayers(err).some((l) => typeof l.message === "string" && names.some((n) => l.message!.includes(n)));
}

class DishCategoriesService extends SessionUpdatableService<typeof dishCategories> {
  private schema = RESOURCES["dish-categories"].schema;

  // New categories are enabled by default; retire/restore flips `enabled`.
  // planIds is membership in category_plans, not a column — split it out so the
  // generic catalog form can carry it like any other field.
  // Category rows feed the dish-category ref and, through weekend flags, meal-size facts.
  private async evictDerived() {
    await invalidateDishCategories();
    await invalidateMealSizeFacts();
  }

  async create(values: Record<string, unknown>) {
    const { planIds, ...rest } = this.schema.parse(values);
    const row = await super.create({ ...rest, enabled: true });
    await this.evictDerived();
    await this.setPlans(row.publicId, planIds as string[]);
    return row;
  }

  async update(id: string, patch: Record<string, unknown>) {
    // The generic catalog retire/restore action toggles `active`; this table has
    // no `active` column, so map it onto `enabled` (its status column).
    if ("active" in patch) {
      const row = await super.update(id, { enabled: Boolean(patch.active) });
      await this.evictDerived();
      return row;
    }
    const { planIds, ...rest } = parsePatch(this.schema, patch);
    let row;
    if (Object.keys(rest).length) {
      row = await super.update(id, rest);
      await this.evictDerived();
    } else {
      row = await this.read(id);
    }
    if (planIds) await this.setPlans(id, planIds as string[]);
    return row;
  }

  async delete(id: string): Promise<number> {
    await super.update(id, { enabled: false });
    await this.evictDerived();
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
    await this.evictDerived();
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

  /** Plan keys per category key: the plans each category can be added to (custom meal item rows). */
  async planKeysByCategoryKey(): Promise<Map<string, string[]>> {
    const rows = await db
      .select({ categoryKey: dishCategories.key, planKey: plans.key })
      .from(categoryPlans)
      .innerJoin(dishCategories, eq(dishCategories.id, categoryPlans.categoryId))
      .innerJoin(plans, eq(plans.id, categoryPlans.planId));
    const out = new Map<string, string[]>();
    for (const r of rows) out.set(r.categoryKey, [...(out.get(r.categoryKey) ?? []), r.planKey]);
    return out;
  }

  /**
   * Active add-ons grouped by the dish-category key they're offered with
   * (addons.category, a soft ref like dishes.category) — the shape
   * loadCatalogSnapshot embeds so the wizard, the admin order form and pricing
   * resolve eligibility from one cached snapshot.
   */
  async addonsByDishCategory(): Promise<Map<string, CatalogAddon[]>> {
    const rows = await db
      .select({ categoryKey: addons.category, addonKey: addons.key, addonName: addons.name, planKey: plans.key, tuAmount: addons.tuAmount, pricePerTiffin: addons.pricePerTiffin, maxQty: addons.maxQty })
      .from(addons)
      .leftJoin(plans, eq(plans.id, addons.planId))
      .where(eq(addons.active, true))
      .orderBy(asc(addons.name));
    const out = new Map<string, CatalogAddon[]>();
    for (const r of rows) {
      const bucket = out.get(r.categoryKey) ?? [];
      bucket.push({ key: r.addonKey, name: r.addonName, category: r.categoryKey, planKey: r.planKey, tuAmount: Number(r.tuAmount), pricePerTiffin: Number(r.pricePerTiffin), maxQty: r.maxQty });
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
  async forPlan(planId: bigint, opts: { fresh?: boolean } = {}) {
    const ref = await dishCategoryRef(opts);
    const inPlan = new Set(ref.memberships.filter((m) => m.planId === planId).map((m) => m.categoryId));
    return bySortOrder(ref.categories.filter((c) => c.enabled && inPlan.has(c.id))).map((c) => ({
      key: c.key,
      label: c.label,
      selectable: c.selectable,
      sortOrder: c.sortOrder,
      // TU facts for admin composition hints (natural-unit readouts) — not a second ratio store.
      tuUnitType: c.tuUnitType,
      tuUnitSize: c.tuUnitSize,
      tuUnitLabel: c.tuUnitLabel,
    }));
  }

  /**
   * Slots for a whole menu week. A week is still tiffin-or-healthy and serves
   * every plan of that type, so this is the union of those plans' slots.
   */
  async forPlanType(planType: "tiffin" | "healthy") {
    const ref = await dishCategoryRef();
    const typePlanIds = new Set(ref.plans.filter((p) => p.planType === planType).map((p) => p.id));
    const inType = new Set(ref.memberships.filter((m) => typePlanIds.has(m.planId)).map((m) => m.categoryId));
    return dedupeByKey(
      bySortOrder(ref.categories.filter((c) => c.enabled && inType.has(c.id))).map((c) => ({
        key: c.key, label: c.label, selectable: c.selectable, sortOrder: c.sortOrder,
      })),
    );
  }

  async enabledCategories() {
    const ref = await dishCategoryRef();
    return dedupeByKey(
      bySortOrder(ref.categories.filter((c) => c.enabled)).map((c) => ({
        key: c.key,
        label: c.label,
        icon: c.icon,
        selectable: c.selectable,
        sortOrder: c.sortOrder,
        tuUnitType: c.tuUnitType,
        tuUnitSize: c.tuUnitSize,
        tuUnitLabel: c.tuUnitLabel,
      })),
    );
  }

  /**
   * Resolves (fromKey, toKey, planId) to its category_swap_pairs row id, if
   * configured at all — matching either a rule scoped to exactly this plan or
   * a null-plan ("all plans") rule. Meal-size-scoped rows are not plan-level config and are skipped.
   */
  private async findSwapPairId(fromKey: string, toKey: string, planId: bigint): Promise<bigint | null> {
    const rows = await db
      .select({ id: categorySwapPairs.id })
      .from(categorySwapPairs)
      .innerJoin(dishCategories, eq(dishCategories.id, categorySwapPairs.fromCategoryId))
      .where(and(eq(dishCategories.key, fromKey), isNull(categorySwapPairs.mealSizeId), or(isNull(categorySwapPairs.planId), eq(categorySwapPairs.planId, planId))))
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

  async listSwapPairs() {
    // Small table, admin-only read: resolve both sides against one category
    // lookup rather than joining dish_categories twice (drizzle needs an
    // explicit alias for a self-join, more ceremony than this is worth here).
    const [pairs, cats, planRows, sizeRows] = await Promise.all([
      db
        .select({
          id: categorySwapPairs.id,
          publicId: categorySwapPairs.publicId,
          fromCategoryId: categorySwapPairs.fromCategoryId,
          toCategoryId: categorySwapPairs.toCategoryId,
          planId: categorySwapPairs.planId,
          exchangeOverrides: categorySwapPairs.exchangeOverrides,
          naturalFallback: categorySwapPairs.naturalFallback,
          receivesMissing: categorySwapPairs.receivesMissing,
          mealSizeId: categorySwapPairs.mealSizeId,
        })
        .from(categorySwapPairs),
      db.select({ id: dishCategories.id, key: dishCategories.key, label: dishCategories.label }).from(dishCategories),
      db.select({ id: plans.id, publicId: plans.publicId, name: plans.name }).from(plans),
      db.select({ id: mealSizes.id, publicId: mealSizes.publicId, name: mealSizes.name }).from(mealSizes),
    ]);
    const sizeById = new Map(sizeRows.map((m) => [m.id, m]));
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
      exchangeOverrides: p.exchangeOverrides,
      naturalFallback: p.naturalFallback,
      receivesMissing: p.receivesMissing,
      mealSizeId: p.mealSizeId == null ? null : (sizeById.get(p.mealSizeId)?.publicId ?? null),
      mealSizeName: p.mealSizeId == null ? null : (sizeById.get(p.mealSizeId)?.name ?? null),
    }));
  }

  /** Resolves a plan public id to its bigint id, or null when omitted ("all plans"). */
  private async resolvePlanId(planPublicId: string | null | undefined): Promise<bigint | null> {
    if (!planPublicId) return null;
    const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.publicId, planPublicId)).limit(1);
    if (!plan) throw new ValidationError("Plan not found");
    return plan.id;
  }

  /**
   * Resolves the optional meal size scope. A meal size belongs to exactly one plan, so the stored
   * planId follows it; an explicit plan that disagrees is a caller mistake.
   */
  private async resolveScope(
    planPublicId: string | null | undefined,
    mealSizePublicId: string | null | undefined,
  ): Promise<{ planId: bigint | null; mealSizeId: bigint | null }> {
    const planId = await this.resolvePlanId(planPublicId);
    if (!mealSizePublicId) return { planId, mealSizeId: null };
    const [size] = await db.select({ id: mealSizes.id, planId: mealSizes.planId }).from(mealSizes).where(eq(mealSizes.publicId, mealSizePublicId)).limit(1);
    if (!size) throw new ValidationError("Meal size not found");
    if (planId != null && planId !== size.planId) throw new ValidationError("Meal size is not on this plan");
    return { planId: size.planId, mealSizeId: size.id };
  }

  /** Edit scope: an omitted meal size keeps the row's current one, null clears it. */
  private async editScope(publicId: string, planPublicId: string | null | undefined, mealSizePublicId: string | null | undefined) {
    if (mealSizePublicId !== undefined) return this.resolveScope(planPublicId, mealSizePublicId);
    const [row] = await db
      .select({ sizePublicId: mealSizes.publicId })
      .from(categorySwapPairs)
      .leftJoin(mealSizes, eq(mealSizes.id, categorySwapPairs.mealSizeId))
      .where(eq(categorySwapPairs.publicId, publicId))
      .limit(1);
    return this.resolveScope(planPublicId, row?.sizePublicId ?? null);
  }

  async addSwapPair(
    fromKey: string,
    toKey: string,
    planPublicId?: string | null,
    opts: { exchangeOverrides?: ExchangeOverride[]; naturalFallback?: boolean; receivesMissing?: boolean; mealSizePublicId?: string | null; actorId?: bigint | null } = {},
  ) {
    const [rows, scope] = await Promise.all([
      db
        .select({ key: dishCategories.key, id: dishCategories.id, enabled: dishCategories.enabled })
        .from(dishCategories)
        .where(inArray(dishCategories.key, [fromKey, toKey])),
      this.resolveScope(planPublicId, opts.mealSizePublicId),
    ]);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const from = byKey.get(fromKey);
    const to = byKey.get(toKey);
    if (!from || !from.enabled) throw new ValidationError(disabledCategoryMessage(fromKey));
    if (!to || !to.enabled) throw new ValidationError(disabledCategoryMessage(toKey));
    try {
      const [created] = await db
        .insert(categorySwapPairs)
        .values({
          fromCategoryId: from.id, toCategoryId: to.id, ...scope,
          exchangeOverrides: opts.exchangeOverrides ?? [],
          naturalFallback: opts.naturalFallback ?? true,
          receivesMissing: opts.receivesMissing ?? false,
          createdBy: opts.actorId ?? null, updatedBy: opts.actorId ?? null,
        })
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
  async editSwapPair(
    publicId: string,
    fromKey: string,
    toKey: string,
    planPublicId?: string | null,
    opts: { exchangeOverrides?: ExchangeOverride[]; naturalFallback?: boolean; receivesMissing?: boolean; mealSizePublicId?: string | null; actorId?: bigint | null } = {},
  ) {
    const [rows, scope] = await Promise.all([
      db
        .select({ key: dishCategories.key, id: dishCategories.id, enabled: dishCategories.enabled })
        .from(dishCategories)
        .where(inArray(dishCategories.key, [fromKey, toKey])),
      this.editScope(publicId, planPublicId, opts.mealSizePublicId),
    ]);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const from = byKey.get(fromKey);
    const to = byKey.get(toKey);
    if (!from || !from.enabled) throw new ValidationError(disabledCategoryMessage(fromKey));
    if (!to || !to.enabled) throw new ValidationError(disabledCategoryMessage(toKey));
    try {
      const updated = await db
        .update(categorySwapPairs)
        .set({
          fromCategoryId: from.id, toCategoryId: to.id, ...scope,
          // Omitted = keep what is there; applied swaps keep their own receive_tu snapshot either way.
          ...(opts.exchangeOverrides ? { exchangeOverrides: opts.exchangeOverrides } : {}),
          ...(opts.naturalFallback != null ? { naturalFallback: opts.naturalFallback } : {}),
          ...(opts.receivesMissing != null ? { receivesMissing: opts.receivesMissing } : {}),
          updatedBy: opts.actorId ?? null,
        })
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
    const size = await mealSizeFacts(mealSizeId);
    if (!size) return new Map();
    const [ref, items] = await Promise.all([dishCategoryRef(), loadMealSizeItems(mealSizeId)]);
    const inPlan = new Set(ref.memberships.filter((m) => m.planId === size.planId).map((m) => m.categoryId));
    const cats = bySortOrder(ref.categories.filter((c) => c.enabled && inPlan.has(c.id)));
    const rowTu = tuSlotsByCategory(items);
    const pickTu = new Map([...rowTu].map(([category, slots]) => [category, slots[0]!]));
    return new Map(cats.map((c) => [c.key, {
      key: c.key, pickTu: pickTu.get(c.key) ?? null, ...(rowTu.has(c.key) ? { rowTu: rowTu.get(c.key) } : {}), unitType: c.tuUnitType, unitLabel: c.tuUnitLabel, unitSize: Number(c.tuUnitSize), maxPicksPerTiffin: c.maxPicksPerTiffin,
      ...(size.custom && !pickTu.has(c.key) ? { addable: true } : {}),
    }]));
  }

  /**
   * Every plan a meal size's own composition draws dishes from — the meal
   * size's own planId plus whatever other plans its mealSizeItems rows
   * independently target (e.g. a non-veg thali with a veg-tagged Sabzi row).
   * Mirrors allowedDishIdsForMealSize in lib/menu/dish-eligibility.ts, which unions
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
   * the rule, run for every pair and plan in four queries. Keys are `from>to`, each with its exchange rule: for the same
   * pair a meal-size rule beats a plan rule beats an all-plans rule, whatever the row order.
   */
  private async allowedSwapPairKeys(mealSizeId: bigint): Promise<Map<string, SwapPairRule>> {
    // Custom meals swap like catalog meals (2026-10-07; reverses spec 2026-09-28 rule 6): staff were
    // posting their day-to-day edits to Slack because Edit meal offered nothing for them.
    const planIds = await this.reachablePlanIdsForMealSize(mealSizeId);
    if (!planIds.length) return new Map();
    const [pairs, cats, dishCats] = await Promise.all([
      db
        .select({
          fromCategoryId: categorySwapPairs.fromCategoryId,
          toCategoryId: categorySwapPairs.toCategoryId,
          planId: categorySwapPairs.planId,
          exchangeOverrides: categorySwapPairs.exchangeOverrides,
          naturalFallback: categorySwapPairs.naturalFallback,
          receivesMissing: categorySwapPairs.receivesMissing,
          mealSizeId: categorySwapPairs.mealSizeId,
        })
        .from(categorySwapPairs)
        .where(and(
          or(isNull(categorySwapPairs.planId), inArray(categorySwapPairs.planId, planIds)),
          or(isNull(categorySwapPairs.mealSizeId), eq(categorySwapPairs.mealSizeId, mealSizeId)),
        ))
        .orderBy(asc(categorySwapPairs.id)),
      db.select({ id: dishCategories.id, key: dishCategories.key }).from(dishCategories),
      db.selectDistinct({ category: dishes.category, planId: dishes.planId }).from(dishes).where(inArray(dishes.planId, planIds)),
    ]);
    const keyOf = new Map(cats.map((c) => [c.id, c.key]));
    const hasDish = new Set(dishCats.map((d) => `${d.category}@${d.planId}`));
    const out = new Map<string, SwapPairRule>();
    const rank = new Map<string, number>();
    for (const p of pairs) {
      const from = keyOf.get(p.fromCategoryId);
      const to = keyOf.get(p.toCategoryId);
      if (!from || !to) continue;
      // A meal-size row stores its size's own plan, but the size reaches other plans too (non-veg sizes carry veg rows).
      const plansForRule = p.planId == null || p.mealSizeId != null ? planIds : [p.planId];
      if (!plansForRule.some((planId) => hasDish.has(`${to}@${planId}`))) continue;
      const key = `${from}>${to}`;
      // meal size (2) > plan (1) > all plans (0), whatever the row order.
      const r = p.mealSizeId != null ? 2 : p.planId != null ? 1 : 0;
      if ((rank.get(key) ?? -1) >= r) continue;
      rank.set(key, r);
      out.set(key, { overrides: p.exchangeOverrides, naturalFallback: p.naturalFallback, receivesMissing: p.receivesMissing });
    }
    return out;
  }

  /** The pair's exchange rule (override lines + other amounts) on this meal size; null when the pair isn't allowed there. */
  async swapPairRuleForMealSize(fromKey: string, toKey: string, mealSizeId: bigint): Promise<SwapPairRule | null> {
    return (await this.allowedSwapPairKeys(mealSizeId)).get(`${fromKey}>${toKey}`) ?? null;
  }

  /** Pairs the swap drawer may offer for one meal size — the same gate applyDeliverySwap enforces. */
  async swapPairsForMealSize(
    mealSizeId: bigint,
  ): Promise<{ fromCategory: string; toCategory: string; exchangeOverrides: ExchangeOverride[]; naturalFallback: boolean; receivesMissing: boolean }[]> {
    const [cats, allowed] = await Promise.all([this.swapCategoriesForMealSize(mealSizeId), this.allowedSwapPairKeys(mealSizeId)]);
    return [...allowed].flatMap(([k, rule]) => {
      const [fromCategory, toCategory] = k.split(">") as [string, string];
      const from = cats.get(fromCategory);
      const to = cats.get(toCategory);
      return from && to && swapPairFits(from, to, rule.receivesMissing) ? [{ fromCategory, toCategory, exchangeOverrides: rule.overrides, naturalFallback: rule.naturalFallback, receivesMissing: rule.receivesMissing }] : [];
    });
  }

  async removeSwapPair(publicId: string): Promise<void> {
    const deleted = await db.delete(categorySwapPairs).where(eq(categorySwapPairs.publicId, publicId)).returning({ id: categorySwapPairs.id });
    if (deleted.length === 0) throw new ValidationError("Swap pair not found");
  }
}

const repo = new UpdatableRepository(db, dishCategories, dishCategories.publicId, dishCategories.id);
export const dishCategoriesService = new DishCategoriesService(repo);
