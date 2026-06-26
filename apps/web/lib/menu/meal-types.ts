import { z } from "zod";
import { ValidationError } from "@tiffin/commons";

export const PLAN_TYPES = ["tiffin", "healthy"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];
export type MealSlot = { key: string; label: string };
export type MealTypeConfig = { slots: MealSlot[]; accent: string; titlePrefix: string };
export type MealTypesSettings = Record<PlanType, MealTypeConfig>;

const slotSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/, "slot key must be lowercase alphanumeric/underscore"),
  label: z.string().min(1),
});
const configSchema = z.object({
  slots: z.array(slotSchema).min(1),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  titlePrefix: z.string().min(1),
});
export const mealTypesSchema = z.object({ tiffin: configSchema, healthy: configSchema });

export function parseMealTypes(value: unknown): MealTypesSettings {
  const r = mealTypesSchema.safeParse(value);
  if (!r.success) throw new ValidationError(`Invalid meal types: ${r.error.issues[0]?.message ?? "unknown"}`);
  return r.data;
}

export const DEFAULT_MEAL_TYPES: MealTypesSettings = {
  tiffin: { slots: [{ key: "lunch", label: "Lunch" }], accent: "#F0820A", titlePrefix: "Tiffin Menu" },
  healthy: {
    slots: [
      { key: "breakfast", label: "Breakfast" },
      { key: "lunch", label: "Lunch" },
      { key: "dinner", label: "Dinner" },
    ],
    accent: "#1FAE54",
    titlePrefix: "Healthy Menu",
  },
};
