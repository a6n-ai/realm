import { UpdatableRepository } from "@tiffin/commons-drizzle";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSlots } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

class MealSlotsService extends SessionUpdatableService<typeof mealSlots> {
  async enabledSlots() {
    return db
      .select({ key: mealSlots.key, label: mealSlots.label, sortOrder: mealSlots.sortOrder })
      .from(mealSlots)
      .where(eq(mealSlots.enabled, true))
      .orderBy(asc(mealSlots.sortOrder));
  }
}

const repo = new UpdatableRepository(db, mealSlots, mealSlots.publicId, mealSlots.id);
export const mealSlotsService = new MealSlotsService(repo);
