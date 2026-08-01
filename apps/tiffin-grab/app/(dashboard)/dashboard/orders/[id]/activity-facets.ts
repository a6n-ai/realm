import type { FacetDef } from "@/components/ds";

/** Activity categories — maps to order_activity_type groups in the log table. */
export const ACTIVITY_CATEGORY_TYPES = {
  // route_pushed sits with deliveries: it is fulfillment, and staff ask "was this stop on
  // the route?" in the same breath as "was it skipped?".
  deliveries: ["skipped", "unskipped", "delivery_address_changed", "pool_scheduled", "route_pushed"],
  meals: ["meal_pick"],
  lifecycle: ["created", "activated", "paused", "resumed", "cancelled", "status_change"],
  payments: ["payment_claimed", "payment_verified", "payment_rejected"],
  notes: ["note"],
} as const;

export type ActivityCategory = keyof typeof ACTIVITY_CATEGORY_TYPES;

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  deliveries: "Deliveries",
  meals: "Meals",
  lifecycle: "Lifecycle",
  payments: "Payments",
  notes: "Notes",
};

export const ORDER_ACTIVITY_FACETS: FacetDef[] = [
  {
    kind: "pills",
    field: "category",
    label: "Type",
    options: (Object.keys(ACTIVITY_CATEGORY_TYPES) as ActivityCategory[]).map((c) => ({
      value: c,
      label: CATEGORY_LABELS[c],
    })),
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
    const allowed = new Set<string>(ACTIVITY_CATEGORY_TYPES[category as ActivityCategory]);
    out = out.filter((row) => allowed.has(row.type));
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
