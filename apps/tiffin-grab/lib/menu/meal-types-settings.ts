import { DEFAULT_MEAL_TYPES, parseMealTypes, type MealTypesSettings } from "./meal-types";
import { settingsCache, saveSetting } from "@/lib/settings";
import { db } from "@/db/client";
import { app } from "@/db/schema";

export async function getMealTypes(): Promise<MealTypesSettings> {
  return settingsCache.getOrSet("mealTypes", async () => {
    const [row] = await db.select({ mt: app.mealTypes }).from(app).limit(1);
    if (!row?.mt) return DEFAULT_MEAL_TYPES;
    try {
      return parseMealTypes(row.mt);
    } catch {
      return DEFAULT_MEAL_TYPES;
    }
  });
}

export async function setMealTypes(cfg: MealTypesSettings): Promise<void> {
  const parsed = parseMealTypes(cfg);
  await saveSetting({ mealTypes: parsed });
}
