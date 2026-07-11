import { UpdatableRepository } from "@realm/database";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishCategories } from "@/db/schema";
import { RESOURCES } from "@/app/(dashboard)/dashboard/catalog/resource-config";
import { SessionUpdatableService } from "./session-service";

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

  async forPlanType(planType: "tiffin" | "healthy") {
    return db
      .select({ key: dishCategories.key, label: dishCategories.label, selectable: dishCategories.selectable, sortOrder: dishCategories.sortOrder })
      .from(dishCategories)
      .where(and(eq(dishCategories.planType, planType), eq(dishCategories.enabled, true)))
      .orderBy(asc(dishCategories.sortOrder));
  }

  async enabledCategories() {
    const rows = await db
      .select({ key: dishCategories.key, label: dishCategories.label, selectable: dishCategories.selectable, sortOrder: dishCategories.sortOrder })
      .from(dishCategories)
      .where(eq(dishCategories.enabled, true))
      .orderBy(asc(dishCategories.sortOrder));
    const seen = new Set<string>();
    return rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
  }
}

const repo = new UpdatableRepository(db, dishCategories, dishCategories.publicId, dishCategories.id);
export const dishCategoriesService = new DishCategoriesService(repo);
