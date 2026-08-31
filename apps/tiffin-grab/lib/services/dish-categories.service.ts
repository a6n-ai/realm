import { UpdatableRepository } from "@foundry/database";
import { ValidationError } from "@foundry/commons";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { categoryPlans, categorySwapPairs, dishCategories, plans } from "@/db/schema";
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
    const { planIds, ...rest } = this.schema.parse(values);
    const row = await super.create({ ...rest, enabled: true });
    await this.setPlans(row.publicId, planIds as string[]);
    return row;
  }

  async update(id: string, patch: Record<string, unknown>) {
    // The generic catalog retire/restore action toggles `active`; this table has
    // no `active` column, so map it onto `enabled` (its status column).
    if ("active" in patch) return super.update(id, { enabled: Boolean(patch.active) });
    const { planIds, ...rest } = this.schema.partial().parse(patch);
    const row = Object.keys(rest).length ? await super.update(id, rest) : await this.read(id);
    if (planIds) await this.setPlans(id, planIds as string[]);
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

  /**
   * Global guardrail: is (fromKey, toKey) EVER allowed to swap, anywhere? A swap
   * moves N picks of fromKey for however many toKey picks its own tuAmount works
   * out to (see category-swaps.service.ts) — this table carries no ratio, only
   * eligibility.
   */
  async isSwapPairAllowed(fromKey: string, toKey: string): Promise<boolean> {
    const rows = await db
      .select({ id: categorySwapPairs.id })
      .from(categorySwapPairs)
      .innerJoin(dishCategories, eq(dishCategories.id, categorySwapPairs.fromCategoryId))
      .where(eq(dishCategories.key, fromKey))
      .limit(1000);
    if (rows.length === 0) return false;
    // Two-step (rather than a single join on both sides) because we need both
    // categories resolved by key first — same tradeoff isSwapAllowed in
    // category-swaps.service.ts makes for the per-meal-size rule check.
    const [pair] = await db
      .select({ id: categorySwapPairs.id })
      .from(categorySwapPairs)
      .innerJoin(dishCategories, eq(dishCategories.id, categorySwapPairs.toCategoryId))
      .where(and(inArray(categorySwapPairs.id, rows.map((r) => r.id)), eq(dishCategories.key, toKey)))
      .limit(1);
    return pair != null;
  }

  async listSwapPairs() {
    // Small table, admin-only read: resolve both sides against one category
    // lookup rather than joining dish_categories twice (drizzle needs an
    // explicit alias for a self-join, more ceremony than this is worth here).
    const [pairs, cats] = await Promise.all([
      db.select({ publicId: categorySwapPairs.publicId, fromCategoryId: categorySwapPairs.fromCategoryId, toCategoryId: categorySwapPairs.toCategoryId }).from(categorySwapPairs),
      db.select({ id: dishCategories.id, key: dishCategories.key, label: dishCategories.label }).from(dishCategories),
    ]);
    const byId = new Map(cats.map((c) => [c.id, c]));
    return pairs.map((p) => ({
      id: p.publicId,
      fromKey: byId.get(p.fromCategoryId)?.key ?? "",
      fromLabel: byId.get(p.fromCategoryId)?.label ?? "",
      toKey: byId.get(p.toCategoryId)?.key ?? "",
      toLabel: byId.get(p.toCategoryId)?.label ?? "",
    }));
  }

  async addSwapPair(fromKey: string, toKey: string) {
    if (fromKey === toKey) throw new ValidationError("A swap pair must be between two different categories");
    const rows = await db.select({ key: dishCategories.key, id: dishCategories.id }).from(dishCategories).where(inArray(dishCategories.key, [fromKey, toKey]));
    const byKey = new Map(rows.map((r) => [r.key, r.id]));
    const fromId = byKey.get(fromKey);
    const toId = byKey.get(toKey);
    if (!fromId) throw new ValidationError(`Category "${fromKey}" not found`);
    if (!toId) throw new ValidationError(`Category "${toKey}" not found`);
    try {
      const [created] = await db.insert(categorySwapPairs).values({ fromCategoryId: fromId, toCategoryId: toId }).returning();
      return created;
    } catch (e) {
      if (e instanceof Error && e.message.includes("category_swap_pairs_pair_unique")) {
        throw new ValidationError("This pair is already globally swappable");
      }
      throw e;
    }
  }

  /**
   * Globally-eligible (fromKey, toKey) pairs restricted to a given category set —
   * e.g. one meal size's own composition, so a picker never offers a pair the
   * meal size doesn't actually serve on either side.
   */
  async swapPairsForCategories(categories: string[]): Promise<{ fromCategory: string; toCategory: string }[]> {
    if (categories.length < 2) return [];
    const set = new Set(categories);
    const all = await this.listSwapPairs();
    return all
      .filter((p) => set.has(p.fromKey) && set.has(p.toKey))
      .map((p) => ({ fromCategory: p.fromKey, toCategory: p.toKey }));
  }

  async removeSwapPair(publicId: string): Promise<void> {
    const deleted = await db.delete(categorySwapPairs).where(eq(categorySwapPairs.publicId, publicId)).returning({ id: categorySwapPairs.id });
    if (deleted.length === 0) throw new ValidationError("Swap pair not found");
  }
}

const repo = new UpdatableRepository(db, dishCategories, dishCategories.publicId, dishCategories.id);
export const dishCategoriesService = new DishCategoriesService(repo);
