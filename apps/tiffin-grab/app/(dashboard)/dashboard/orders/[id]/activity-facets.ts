import type { FacetDef } from "@/components/ds";

/** Activity categories — maps to order_activity_type groups in the log table. */
export const ACTIVITY_CATEGORY_TYPES = {
  deliveries: ["skipped", "unskipped", "delivery_address_changed", "pool_scheduled"],
  lifecycle: ["created", "activated", "paused", "resumed", "cancelled", "status_change"],
  meals: ["meal_pick"],
  notes: ["note"],
} as const;

export type ActivityCategory = keyof typeof ACTIVITY_CATEGORY_TYPES;

export const ORDER_ACTIVITY_FACETS: FacetDef[] = [
  {
    kind: "pills",
    field: "category",
    label: "Type",
    options: [
      { value: "deliveries", label: "Deliveries" },
      { value: "lifecycle", label: "Lifecycle" },
      { value: "meals", label: "Meals" },
      { value: "notes", label: "Notes" },
    ],
  },
  {
    kind: "pills",
    field: "actorKind",
    label: "By",
    options: [
      { value: "staff", label: "Staff" },
      { value: "customer", label: "Customer" },
      { value: "system", label: "System" },
    ],
  },
  { kind: "dateRange", field: "createdAt", label: "Time" },
];

const num = (v: string | null): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function filterActivityRows<
  T extends { type: string; createdAt: number; actorKind: "system" | "staff" | "customer" },
>(rows: T[], params: URLSearchParams): T[] {
  let out = rows;

  const category = params.get("category");
  if (category && category in ACTIVITY_CATEGORY_TYPES) {
    const allowed = new Set(ACTIVITY_CATEGORY_TYPES[category as ActivityCategory]);
    out = out.filter((row) => allowed.has(row.type as (typeof ACTIVITY_CATEGORY_TYPES)[ActivityCategory][number]));
  }

  const actorKind = params.get("actorKind");
  if (actorKind === "staff" || actorKind === "customer" || actorKind === "system") {
    out = out.filter((row) => row.actorKind === actorKind);
  }

  const from = num(params.get("from"));
  const to = num(params.get("to"));
  if (from != null) out = out.filter((row) => row.createdAt >= from);
  if (to != null) out = out.filter((row) => row.createdAt <= to);

  return out;
}
