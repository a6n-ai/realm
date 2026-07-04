import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSlots } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

class MealSlotsService extends SessionUpdatableService<typeof mealSlots> {
  async forPlanType(planType: "tiffin" | "healthy") {
    return db
      .select({ key: mealSlots.key, label: mealSlots.label, sortOrder: mealSlots.sortOrder })
      .from(mealSlots)
      .where(and(eq(mealSlots.planType, planType), eq(mealSlots.enabled, true)))
      .orderBy(asc(mealSlots.sortOrder));
  }

  async enabledSlots() {
    const rows = await db
      .select({ key: mealSlots.key, label: mealSlots.label, sortOrder: mealSlots.sortOrder })
      .from(mealSlots)
      .where(eq(mealSlots.enabled, true))
      .orderBy(asc(mealSlots.sortOrder));
    const seen = new Set<string>();
    return rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
  }
}

const repo = new UpdatableRepository(db, mealSlots, mealSlots.publicId, mealSlots.id);
export const mealSlotsService = new MealSlotsService(repo);
