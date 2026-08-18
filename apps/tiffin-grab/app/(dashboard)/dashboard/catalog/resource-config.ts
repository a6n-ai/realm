import { z } from "zod";

export type FieldType = "text" | "number" | "csv" | "select" | "multiselect" | "date" | "boolean" | "color" | "categoryCounts" | "composition";

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

// Underscores are allowed alongside hyphens: real seeded keys (meal_sizes.key like
// "maharaja_veg", delivery_frequencies.key "5_day") already use them, and this same schema
// re-validates the key on every edit save even though it's readOnlyOnEdit — a hyphen-only
// regex here silently blocked saving ANY edit to those existing rows.
const key = z.string().trim().regex(/^[a-z0-9_-]+$/, "lowercase letters, numbers, underscores and hyphens only");
const name = z.string().trim().min(1, "Name is required");
const active = z.boolean().optional();

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
  // Display tag shown against dishes on this plan. Rendered verbatim — no code
  // reads it to decide anything.
  tagLabel: z.string().trim().max(24).optional().nullable(),
  tagColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour").optional().nullable(),
  allowedStartDays: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).default([]),
  active,
});

// A composition row: the required NOT NULL `name`, a category soft-ref (validated
// against dish_categories server-side), an optional numeric weight (numeric column
// ⇒ string in Drizzle, nullable) with a nullable unit, and a positive qty.
// No free-text name: an item IS a category (Sabzi, Roti …), and its display name
// is that category's label, resolved server-side. Typing names by hand let the
// same slot be spelled three ways across meal sizes.
const compositionItem = z.object({
  category: z.string().trim().min(1, "Pick a category"),
  weightValue: z.preprocess((v) => (v === "" || v == null ? null : String(v)), z.string().nullable()),
  weightUnit: z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(["oz", "g", "ml", "piece"]).nullable()),
  qty: reqNum(z.coerce.number().int().positive()),
});

const mealSizesSchema = z.object({
  key, name,
  description: z.string().trim().optional().nullable(),
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
  // "none" is the off-switch — discountValue is ignored (ok to leave stale/0) when type is
  // "none". Mirrors db/schema/catalog.ts's mealSizeDiscountType — never two separate nullable
  // percent/flat columns, which would leave an ambiguous both-set case.
  discountType: z.enum(["none", "percent", "flat"]).default("none"),
  discountValue: reqNum(z.coerce.number().nonnegative().default(0)),
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
  // Per-package pause-limit overrides; null (blank) falls back to the app-wide default.
  maxPauses: optNum(z.coerce.number().int().nonnegative()),
  maxPauseDaysTotal: optNum(z.coerce.number().int().nonnegative()),
  maxPauseStretchDays: optNum(z.coerce.number().int().nonnegative()),
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
  // Plan public_ids. Replaces the old `diet` enum: which plans a dish may appear
  // on is explicit membership, and at least one is required because a dish
  // attached to nothing is invisible on every menu.
  planIds: z.array(z.string()).min(1, "Pick at least one plan"),
  // Soft ref to dish_categories.key; nullable so an uncategorized dish stays
  // placeable in any menu slot (I5). Enforced server-side via dishesService.
  category: optCategory,
  active,
});

// dish_categories uses `enabled` as its status column (not `active`); retire/
// restore maps to it in dishCategoriesService. `key` is globally unique now, so a
// slot shared by several plans is one row attached to each.
const dishCategoriesSchema = z.object({
  key,
  label: name,
  planIds: z.array(z.string()).min(1, "Pick at least one plan"),
  selectable: z.boolean().default(false),
  sortOrder: reqNum(z.coerce.number().int().nonnegative().default(0)),
});

export const RESOURCES: Record<string, ResourceDef> = {
  dishes: {
    key: "dishes", label: "Dishes", singular: "dish", keyed: false, schema: dishesSchema,
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "planIds", label: "Plans", type: "multiselect", optionsSource: "plans" },
      { key: "category", label: "Category", type: "select", optionsSource: "categories", optional: true },
      { key: "description", label: "Description", type: "text", optional: true, tableHidden: true },
    ],
  },
  "dish-categories": {
    key: "dish-categories", label: "Categories", singular: "category", keyed: true, schema: dishCategoriesSchema, statusField: "enabled",
    fields: [
      { key: "key", label: "Key", type: "text", readOnlyOnEdit: true },
      { key: "label", label: "Label", type: "text" },
      { key: "planIds", label: "Plans", type: "multiselect", optionsSource: "plans" },
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
      { key: "tagLabel", label: "Tag", type: "text", optional: true },
      { key: "tagColor", label: "Tag colour", type: "color", optional: true },
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
      { key: "discountType", label: "Discount type", type: "select", options: ["none", "percent", "flat"], optionLabels: { none: "No discount", percent: "Percent", flat: "Flat $" } },
      { key: "discountValue", label: "Discount value", type: "number", unit: "" },
      { key: "description", label: "Description", type: "text", optional: true, tableHidden: true },
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
      { key: "maxPauses", label: "Max pauses (blank = app default)", type: "number", optional: true, tableHidden: true },
      { key: "maxPauseDaysTotal", label: "Max pause days total (blank = app default)", type: "number", optional: true, tableHidden: true },
      { key: "maxPauseStretchDays", label: "Max pause stretch days (blank = app default)", type: "number", optional: true, tableHidden: true },
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

// Index-grid cards: dish-categories has no standalone card — its editor is
// folded into the "Dishes & Categories" tabbed page at /dashboard/catalog/dishes.
export function catalogIndexEntries(): ResourceDef[] {
  return Object.values(RESOURCES)
    .filter((r) => r.key !== "dish-categories")
    .map((r) => (r.key === "dishes" ? { ...r, label: "Dishes & Categories" } : r));
}

const ARRAY_TYPES = new Set<FieldType>(["csv", "multiselect"]);

export function rowToForm(def: ResourceDef, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = row[f.key];
    if (ARRAY_TYPES.has(f.type)) out[f.key] = Array.isArray(v) ? v : [];
    else if (f.type === "composition") out[f.key] = Array.isArray(v) ? v : [];
    else if (f.type === "boolean") out[f.key] = Boolean(v);
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
    else if (f.type === "categoryCounts") out[f.key] = {};
    else out[f.key] = "";
  }
  return out;
}
