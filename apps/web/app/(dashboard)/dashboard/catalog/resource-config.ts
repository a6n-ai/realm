export type FieldType = "text" | "number" | "csv" | "select" | "multiselect" | "date" | "boolean";
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  optionsSource?: "mealSlots" | "weekdays" | "leadSources";
  optionLabels?: Record<string, string>;
  unit?: string;
  optional?: boolean;
}
export interface ResourceDef {
  key: string;
  label: string;
  fields: FieldDef[];
}

export const WEEKDAY_OPTIONS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const WEEKDAY_LABELS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
};
const ENUM_LABELS: Record<string, string> = {
  tiffin: "Tiffin", healthy: "Healthy", budget: "Budget", medium: "Medium", premium: "Premium",
  veg: "Veg", nonveg: "Non-veg", both: "Both",
};

export const RESOURCES: Record<string, ResourceDef> = {
  plans: {
    key: "plans",
    label: "Plans",
    fields: [
      { key: "key", label: "Key", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "description", label: "Description", type: "text", optional: true },
      { key: "planType", label: "Plan type", type: "select", options: ["tiffin", "healthy"], optionLabels: ENUM_LABELS },
      { key: "offeredSlots", label: "Offered slots", type: "multiselect", optionsSource: "mealSlots" },
      { key: "allowedStartDays", label: "Allowed start days", type: "multiselect", optionsSource: "weekdays", optionLabels: WEEKDAY_LABELS },
    ],
  },
  "meal-sizes": {
    key: "meal-sizes",
    label: "Meal sizes",
    fields: [
      { key: "key", label: "Key", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "tier", label: "Tier", type: "select", options: ["budget", "medium", "premium"], optionLabels: ENUM_LABELS },
      { key: "diet", label: "Diet", type: "select", options: ["veg", "nonveg", "both"], optionLabels: ENUM_LABELS },
      { key: "components", label: "Components", type: "csv" },
      { key: "kcalMin", label: "kcal min", type: "number", unit: "kcal" },
      { key: "kcalMax", label: "kcal max", type: "number", unit: "kcal" },
      { key: "proteinG", label: "Protein", type: "number", unit: "g", optional: true },
      { key: "carbsG", label: "Carbs", type: "number", unit: "g", optional: true },
      { key: "fatG", label: "Fat", type: "number", unit: "g", optional: true },
      { key: "basePrice", label: "Base price", type: "number", unit: "$" },
    ],
  },
  "delivery-frequencies": {
    key: "delivery-frequencies",
    label: "Delivery frequencies",
    fields: [
      { key: "key", label: "Key", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "daysPerWeek", label: "Days / week", type: "number" },
    ],
  },
  "duration-packages": {
    key: "duration-packages",
    label: "Duration packages",
    fields: [
      { key: "weeks", label: "Weeks", type: "number" },
    ],
  },
  "delivery-zones": {
    key: "delivery-zones",
    label: "Delivery zones",
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "postalPrefixes", label: "Postal prefixes", type: "csv" },
      { key: "slotWindow", label: "Slot window", type: "text" },
    ],
  },
  "pricing-tiers": {
    key: "pricing-tiers",
    label: "Pricing tiers",
    fields: [
      { key: "minQty", label: "Min qty", type: "number" },
      { key: "maxQty", label: "Max qty (blank = unbounded)", type: "number", optional: true },
      { key: "upliftPct", label: "Uplift %", type: "number" },
    ],
  },
  "lead-sources": {
    key: "lead-sources", label: "Lead sources",
    fields: [
      { key: "key", label: "Key", type: "text" },
      { key: "label", label: "Label", type: "text" },
      { key: "isInbound", label: "Inbound (auto-assign)", type: "boolean" },
    ],
  },
  "lead-subsources": {
    key: "lead-subsources", label: "Lead sub-sources",
    fields: [
      { key: "sourceId", label: "Source", type: "select", optionsSource: "leadSources" },
      { key: "key", label: "Key", type: "text" },
      { key: "label", label: "Label", type: "text" },
    ],
  },
};

// Convert a raw DB row into the editor's string-keyed field values.
export function rowToFields(def: ResourceDef, row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of def.fields) {
    const v = row[f.key];
    out[f.key] = (f.type === "csv" || f.type === "multiselect") && Array.isArray(v) ? v.join(", ") : f.type === "boolean" ? String(v ?? false) : v == null ? "" : String(v);
  }
  return out;
}

// Convert editor field strings back into a typed patch for the service.
export function fieldsToPatch(def: ResourceDef, values: Record<string, string>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const f of def.fields) {
    const raw = (values[f.key] ?? "").trim();
    if (f.type === "csv" || f.type === "multiselect") {
      patch[f.key] = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    } else if (f.type === "number") {
      patch[f.key] = raw === "" ? null : Number(raw);
    } else if (f.type === "boolean") {
      patch[f.key] = raw === "true";
    } else if (f.optionsSource === "leadSources") {
      patch[f.key] = raw === "" ? null : BigInt(raw);
    } else {
      patch[f.key] = raw === "" ? (f.optional ? null : "") : raw;
    }
  }
  return patch;
}
