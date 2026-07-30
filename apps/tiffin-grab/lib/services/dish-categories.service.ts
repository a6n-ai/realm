import { UpdatableRepository } from "@realm/database";
import { ValidationError } from "@realm/commons";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { categoryPlans, dishCategories, plans } from "@/db/schema";
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
  async create(values: Record<string, unknown>) {
    return super.create({ ...this.schema.parse(values), enabled: true });
  }

  async update(id: string, patch: Record<string, unknown>) {
    // The generic catalog retire/restore action toggles `active`; this table has
    // no `active` column, so map it onto `enabled` (its status column).
    if ("active" in patch) return super.update(id, { enabled: Boolean(patch.active) });
    return super.update(id, this.schema.partial().parse(patch));
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
}

const repo = new UpdatableRepository(db, dishCategories, dishCategories.publicId, dishCategories.id);
export const dishCategoriesService = new DishCategoriesService(repo);
