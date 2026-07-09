import { z } from "zod";

export type FieldType = "text" | "number" | "csv" | "select" | "multiselect" | "date" | "boolean" | "image" | "categoryCounts";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  optionsSource?: "weekdays" | "categories";
  optionLabels?: Record<string, string>;
  unit?: string;
  optional?: boolean;
  readOnlyOnEdit?: boolean;
  // Edited in the dialog but kept out of the list table to keep it scannable.
  tableHidden?: boolean;
}

export interface ResourceDef {
  key: string;
  label: string;
  singular: string;
  schema: z.ZodObject<z.ZodRawShape>;
  fields: FieldDef[];
  keyed: boolean;
}

export const WEEKDAY_OPTIONS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const WEEKDAY_LABELS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
};
const ENUM_LABELS: Record<string, string> = {
  tiffin: "Tiffin", healthy: "Healthy", budget: "Budget", medium: "Medium", premium: "Premium",
  veg: "Veg", nonveg: "Non-veg", both: "Both",
};

export function slug(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const key = z.string().trim().regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and hyphens only");
const name = z.string().trim().min(1, "Name is required");
const active = z.boolean().optional();

// Stored image is the full FileDetail JSON; url is what the UI needs. Extra keys pass through.
const fileDetail = z
  .object({ url: z.string().min(1) })
  .passthrough()
  .nullable()
  .optional();

// Form number inputs serialize blanks as "" (see emptyForm/rowToForm). z.coerce.number()
// turns "" into 0 *before* .optional()/.nullable() are consulted, so without these wrappers
// a blank required field silently becomes 0 and a blank optional field becomes 0 (or throws
// on .positive()). Preprocess the blank away first so blanks round-trip correctly.
const reqNum = <T extends z.ZodTypeAny>(inner: T) => z.preprocess((v) => (v === "" ? undefined : v), inner);
const optNum = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === "" || v == null ? null : v), inner.nullable().optional());

const plansSchema = z.object({
  key, name,
  description: z.string().trim().optional().nullable(),
  planType: z.enum(["tiffin", "healthy"]),
  // offeredSlots is derived server-side (planService) as Object.keys(categoryCounts) —
  // accepted here so the round-trip through the generic schema.parse doesn't strip it.
  offeredSlots: z.array(z.string()).default([]),
  // Deep validation (positive integers, non-empty) runs through parseCategoryCounts
  // in planService before this schema ever sees the value; kept loose here.
  categoryCounts: z.record(z.string(), z.number()).default({}),
  allowedStartDays: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).default([]),
  active,
});

const mealSizesSchema = z.object({
  key, name,
  tier: z.enum(["budget", "medium", "premium"]),
  diet: z.enum(["veg", "nonveg", "both"]),
  components: z.array(z.string()).default([]),
  kcalMin: reqNum(z.coerce.number().int().nonnegative()),
  kcalMax: reqNum(z.coerce.number().int().nonnegative()),
  proteinG: optNum(z.coerce.number().int().nonnegative()),
  carbsG: optNum(z.coerce.number().int().nonnegative()),
  fatG: optNum(z.coerce.number().int().nonnegative()),
  basePrice: reqNum(z.coerce.number().nonnegative()),
  active,
});

const deliveryFrequenciesSchema = z.object({
  key, name,
  daysPerWeek: reqNum(z.coerce.number().int().min(1).max(7)),
  courierDiscountPct: reqNum(z.coerce.number().int().min(0).max(100).default(0)),
  active,
});

const durationPackagesSchema = z.object({
  weeks: reqNum(z.coerce.number().int().positive()),
  discountPct: reqNum(z.coerce.number().int().min(0).max(100).default(0)),
  active,
});

const deliveryZonesSchema = z.object({
  name,
  postalPrefixes: z.array(z.string()).default([]),
  slotWindow: z.string().trim().min(1, "Slot window is required"),
  active,
});

const pricingTiersSchema = z.object({
  minQty: reqNum(z.coerce.number().int().nonnegative()),
  maxQty: optNum(z.coerce.number().int().positive()),
  upliftPct: reqNum(z.coerce.number()),
  active,
});

const addonsSchema = z.object({
  key, name,
  pricePerWeek: reqNum(z.coerce.number().nonnegative()),
  active,
});

const dishesSchema = z.object({
  name,
  description: z.string().trim().optional().nullable(),
  diet: z.enum(["veg", "nonveg"]),
  slots: z.array(z.string()).default([]),
  image: fileDetail,
  active,
});

export const RESOURCES: Record<string, ResourceDef> = {
  dishes: {
    key: "dishes", label: "Dishes", singular: "dish", keyed: false, schema: dishesSchema,
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "diet", label: "Diet", type: "select", options: ["veg", "nonveg"], optionLabels: ENUM_LABELS },
      { key: "slots", label: "Categories", type: "multiselect", optionsSource: "categories" },
      { key: "description", label: "Description", type: "text", optional: true, tableHidden: true },
      { key: "image", label: "Image", type: "image", optional: true },
    ],
  },
  plans: {
    key: "plans", label: "Plans", singular: "plan", keyed: true, schema: plansSchema,
    fields: [
      { key: "key", label: "Key", type: "text", readOnlyOnEdit: true },
      { key: "name", label: "Name", type: "text" },
      { key: "description", label: "Description", type: "text", optional: true, tableHidden: true },
      { key: "planType", label: "Plan type", type: "select", options: ["tiffin", "healthy"], optionLabels: ENUM_LABELS },
      { key: "categoryCounts", label: "Categories", type: "categoryCounts", optionsSource: "categories" },
      { key: "allowedStartDays", label: "Allowed start days", type: "multiselect", optionsSource: "weekdays", optionLabels: WEEKDAY_LABELS },
    ],
  },
  "meal-sizes": {
    key: "meal-sizes", label: "Meal sizes", singular: "meal size", keyed: true, schema: mealSizesSchema,
    fields: [
      { key: "key", label: "Key", type: "text", readOnlyOnEdit: true },
      { key: "name", label: "Name", type: "text" },
      { key: "tier", label: "Tier", type: "select", options: ["budget", "medium", "premium"], optionLabels: ENUM_LABELS },
      { key: "diet", label: "Diet", type: "select", options: ["veg", "nonveg", "both"], optionLabels: ENUM_LABELS },
      { key: "components", label: "Components", type: "csv" },
      { key: "kcalMin", label: "kcal min", type: "number", unit: "kcal" },
      { key: "kcalMax", label: "kcal max", type: "number", unit: "kcal" },
      { key: "proteinG", label: "Protein", type: "number", unit: "g", optional: true, tableHidden: true },
      { key: "carbsG", label: "Carbs", type: "number", unit: "g", optional: true, tableHidden: true },
      { key: "fatG", label: "Fat", type: "number", unit: "g", optional: true, tableHidden: true },
      { key: "basePrice", label: "Base price", type: "number", unit: "$" },
    ],
  },
  "delivery-frequencies": {
    key: "delivery-frequencies", label: "Delivery frequencies", singular: "delivery frequency", keyed: true, schema: deliveryFrequenciesSchema,
    fields: [
      { key: "key", label: "Key", type: "text", readOnlyOnEdit: true },
      { key: "name", label: "Name", type: "text" },
      { key: "daysPerWeek", label: "Days / week", type: "number" },
      { key: "courierDiscountPct", label: "Courier discount", type: "number", unit: "%" },
    ],
  },
  "duration-packages": {
    key: "duration-packages", label: "Duration packages", singular: "duration package", keyed: false, schema: durationPackagesSchema,
    fields: [
      { key: "weeks", label: "Weeks", type: "number" },
      { key: "discountPct", label: "Discount", type: "number", unit: "%" },
    ],
  },
  "delivery-zones": {
    key: "delivery-zones", label: "Delivery zones", singular: "delivery zone", keyed: false, schema: deliveryZonesSchema,
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "postalPrefixes", label: "Postal prefixes", type: "csv" },
      { key: "slotWindow", label: "Slot window", type: "text" },
    ],
  },
  "pricing-tiers": {
    key: "pricing-tiers", label: "Pricing tiers", singular: "pricing tier", keyed: false, schema: pricingTiersSchema,
    fields: [
      { key: "minQty", label: "Min qty", type: "number" },
      { key: "maxQty", label: "Max qty (blank = unbounded)", type: "number", optional: true },
      { key: "upliftPct", label: "Uplift %", type: "number", unit: "%" },
    ],
  },
  addons: {
    key: "addons", label: "Add-ons", singular: "add-on", keyed: true, schema: addonsSchema,
    fields: [
      { key: "key", label: "Key", type: "text", readOnlyOnEdit: true },
      { key: "name", label: "Name", type: "text" },
      { key: "pricePerWeek", label: "Price / week", type: "number", unit: "$" },
    ],
  },
};

const ARRAY_TYPES = new Set<FieldType>(["csv", "multiselect"]);

export function rowToForm(def: ResourceDef, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = row[f.key];
    if (ARRAY_TYPES.has(f.type)) out[f.key] = Array.isArray(v) ? v : [];
    else if (f.type === "boolean") out[f.key] = Boolean(v);
    else if (f.type === "image") out[f.key] = v ?? null;
    else if (f.type === "categoryCounts") out[f.key] = v && typeof v === "object" ? v : {};
    else out[f.key] = v == null ? "" : String(v);
  }
  return out;
}

export function emptyForm(def: ResourceDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    if (ARRAY_TYPES.has(f.type)) out[f.key] = [];
    else if (f.type === "boolean") out[f.key] = false;
    else if (f.type === "image") out[f.key] = null;
    else if (f.type === "categoryCounts") out[f.key] = {};
    else out[f.key] = "";
  }
  return out;
}
