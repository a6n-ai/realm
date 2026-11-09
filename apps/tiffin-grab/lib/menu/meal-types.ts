import { PLAN_TYPES, type PlanType } from "@/db/schema/enums";
import { z } from "zod";
import { ValidationError } from "@foundry/commons";

export { PLAN_TYPES, type PlanType };
export type MealSlot = { key: string; label: string; icon?: string | null };

const configSchema = z.object({
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  titlePrefix: z.string().min(1),
});
export const mealTypesSchema = z.object({ tiffin: configSchema, healthy: configSchema });
export type MealTypeConfig = z.infer<typeof configSchema>;
export type MealTypesSettings = Record<PlanType, MealTypeConfig>;

export function parseMealTypes(value: unknown): MealTypesSettings {
  const r = mealTypesSchema.safeParse(value);
  if (!r.success) throw new ValidationError(`Invalid meal types: ${r.error.issues[0]?.message ?? "unknown"}`);
  return r.data;
}

export const DEFAULT_MEAL_TYPES: MealTypesSettings = {
  tiffin: { accent: "#F0820A", titlePrefix: "Tiffin Menu" },
  healthy: { accent: "#1FAE54", titlePrefix: "Healthy Menu" },
};
