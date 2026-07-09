import { UpdatableRepository } from "@realm/database";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishCategories } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

class DishCategoriesService extends SessionUpdatableService<typeof dishCategories> {
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
