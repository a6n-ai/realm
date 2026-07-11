import { z } from "zod";

export type FieldType = "text" | "number" | "csv" | "select" | "multiselect" | "date" | "boolean" | "image" | "categoryCounts" | "composition";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  optionsSource?: "weekdays" | "categories" | "plans";
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
  // Boolean column that carries the retire/restore status. Defaults to "active";
  // dish_categories uses "enabled" instead (no `active` column).
  statusField?: string;
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
  allowedStartDays: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).default([]),
  active,
});

// A composition row: the required NOT NULL `name`, a category soft-ref (validated
// against dish_categories server-side), an optional numeric weight (numeric column
// ⇒ string in Drizzle, nullable) with a nullable unit, and a positive qty.
const compositionItem = z.object({
  name: z.string().trim().min(1, "Item name is required"),
  category: z.string().trim().min(1, "Category is required"),
  weightValue: z.preprocess((v) => (v === "" || v == null ? null : String(v)), z.string().nullable()),
  weightUnit: z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(["oz", "g", "ml", "piece"]).nullable()),
  qty: reqNum(z.coerce.number().int().positive()),
});

const mealSizesSchema = z.object({
  key, name,
  tier: z.enum(["budget", "medium", "premium"]),
  // Plan dropdown value is the plan publicId/key; the service resolves it to
  // plans.id on write (mirrors menu.service). `components` is no longer hand-edited
  // — it is derived from `items` on save.
  planId: z.string().trim().min(1, "Plan is required"),
  items: z.array(compositionItem).default([]),
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

// Select controls serialize "no choice" as "" (see emptyForm/rowToForm); coerce a
// blank category back to null so the optional soft ref round-trips cleanly.
const optCategory = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.string().trim().min(1).nullable().optional(),
);

const dishesSchema = z.object({
  name,
  description: z.string().trim().optional().nullable(),
  diet: z.enum(["veg", "nonveg"]),
  // Soft ref to dish_categories.key; nullable so an uncategorized dish stays
  // placeable in any menu slot (I5). Enforced server-side via dishesService.
  category: optCategory,
  image: fileDetail,
  active,
});

// dish_categories uses `enabled` as its status column (not `active`); retire/
// restore maps to it in dishCategoriesService. Duplicate-key errors surface per
// planType only — the unique constraint is composite (planType, key), a soft ref
// with no FK (Constraint 7).
const dishCategoriesSchema = z.object({
  key,
  label: name,
  planType: z.enum(["tiffin", "healthy"]),
  selectable: z.boolean().default(false),
  sortOrder: reqNum(z.coerce.number().int().nonnegative().default(0)),
});

export const RESOURCES: Record<string, ResourceDef> = {
  dishes: {
    key: "dishes", label: "Dishes", singular: "dish", keyed: false, schema: dishesSchema,
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "diet", label: "Diet", type: "select", options: ["veg", "nonveg"], optionLabels: ENUM_LABELS },
      { key: "category", label: "Category", type: "select", optionsSource: "categories", optional: true },
      { key: "description", label: "Description", type: "text", optional: true, tableHidden: true },
      { key: "image", label: "Image", type: "image", optional: true },
    ],
  },
  "dish-categories": {
    key: "dish-categories", label: "Categories", singular: "category", keyed: true, schema: dishCategoriesSchema, statusField: "enabled",
    fields: [
      { key: "key", label: "Key", type: "text", readOnlyOnEdit: true },
      { key: "label", label: "Label", type: "text" },
      { key: "planType", label: "Plan type", type: "select", options: ["tiffin", "healthy"], optionLabels: ENUM_LABELS },
      { key: "selectable", label: "Customer-selectable", type: "boolean" },
      { key: "sortOrder", label: "Sort order", type: "number" },
    ],
  },
  plans: {
    key: "plans", label: "Plans", singular: "plan", keyed: true, schema: plansSchema,
    fields: [
      { key: "key", label: "Key", type: "text", readOnlyOnEdit: true },
      { key: "name", label: "Name", type: "text" },
      { key: "description", label: "Description", type: "text", optional: true, tableHidden: true },
      { key: "planType", label: "Plan type", type: "select", options: ["tiffin", "healthy"], optionLabels: ENUM_LABELS },
      { key: "allowedStartDays", label: "Allowed start days", type: "multiselect", optionsSource: "weekdays", optionLabels: WEEKDAY_LABELS },
    ],
  },
  "meal-sizes": {
    key: "meal-sizes", label: "Meal sizes", singular: "meal size", keyed: true, schema: mealSizesSchema,
    fields: [
      { key: "key", label: "Key", type: "text", readOnlyOnEdit: true },
      { key: "name", label: "Name", type: "text" },
      { key: "planId", label: "Plan", type: "select", optionsSource: "plans" },
      { key: "tier", label: "Tier", type: "select", options: ["budget", "medium", "premium"], optionLabels: ENUM_LABELS },
      { key: "items", label: "Composition", type: "composition", optionsSource: "categories", tableHidden: true },
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
    else if (f.type === "composition") out[f.key] = Array.isArray(v) ? v : [];
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
    else if (f.type === "composition") out[f.key] = [];
    else if (f.type === "boolean") out[f.key] = false;
    else if (f.type === "image") out[f.key] = null;
    else if (f.type === "categoryCounts") out[f.key] = {};
    else out[f.key] = "";
  }
  return out;
}
