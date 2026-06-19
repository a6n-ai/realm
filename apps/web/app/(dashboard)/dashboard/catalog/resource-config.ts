export type FieldType = "text" | "number" | "csv" | "select";
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  optional?: boolean;
}
export interface ResourceDef {
  key: string;
  label: string;
  fields: FieldDef[];
}

export const RESOURCES: Record<string, ResourceDef> = {
  plans: {
    key: "plans",
    label: "Plans",
    fields: [
      { key: "key", label: "Key", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "description", label: "Description", type: "text", optional: true },
    ],
  },
  "meal-sizes": {
    key: "meal-sizes",
    label: "Meal sizes",
    fields: [
      { key: "key", label: "Key", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "tier", label: "Tier", type: "select", options: ["budget", "medium", "premium"] },
      { key: "diet", label: "Diet", type: "select", options: ["veg", "nonveg", "both"] },
      { key: "components", label: "Components", type: "csv" },
      { key: "kcalMin", label: "kcal min", type: "number" },
      { key: "kcalMax", label: "kcal max", type: "number" },
      { key: "proteinG", label: "Protein g", type: "number", optional: true },
      { key: "carbsG", label: "Carbs g", type: "number", optional: true },
      { key: "fatG", label: "Fat g", type: "number", optional: true },
      { key: "basePrice", label: "Base price", type: "number" },
    ],
  },
  addons: {
    key: "addons",
    label: "Add-ons",
    fields: [
      { key: "key", label: "Key", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "pricePerWeek", label: "Price / week", type: "number" },
    ],
  },
  "delivery-frequencies": {
    key: "delivery-frequencies",
    label: "Delivery frequencies",
    fields: [
      { key: "key", label: "Key", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "daysPerWeek", label: "Days / week", type: "number" },
      { key: "courierDiscountPct", label: "Courier discount %", type: "number" },
    ],
  },
  "duration-packages": {
    key: "duration-packages",
    label: "Duration packages",
    fields: [
      { key: "weeks", label: "Weeks", type: "number" },
      { key: "discountPct", label: "Discount %", type: "number" },
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
};

// Convert a raw DB row into the editor's string-keyed field values.
export function rowToFields(def: ResourceDef, row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of def.fields) {
    const v = row[f.key];
    out[f.key] = f.type === "csv" && Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
  }
  return out;
}

// Convert editor field strings back into a typed patch for the service.
export function fieldsToPatch(def: ResourceDef, values: Record<string, string>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const f of def.fields) {
    const raw = (values[f.key] ?? "").trim();
    if (f.type === "csv") {
      patch[f.key] = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    } else if (f.type === "number") {
      patch[f.key] = raw === "" ? null : Number(raw);
    } else {
      patch[f.key] = raw === "" ? (f.optional ? null : "") : raw;
    }
  }
  return patch;
}
