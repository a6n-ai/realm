import type { FacetDef } from "@/components/ds";

/** Activity categories — maps to order_activity_type groups in the log table. */
export const ACTIVITY_CATEGORY_TYPES = {
  deliveries: ["skipped", "unskipped", "delivery_address_changed", "pool_scheduled"],
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

/**
 * The same log table answers two different questions, so each admin page sees only its
 * own half: the customer page asks "what is this person receiving, and what changed?",
 * the order page asks "what did this cost, and has it been paid?". Splitting by scope
 * rather than by page means a new activity type is assigned once, here.
 */
export const ACTIVITY_SCOPES = {
  subscription: ["deliveries", "meals"],
  commercial: ["lifecycle", "payments", "notes"],
} as const satisfies Record<string, readonly ActivityCategory[]>;

export type ActivityScope = keyof typeof ACTIVITY_SCOPES;

export function activityTypesInScope(scope: ActivityScope): Set<string> {
  return new Set(ACTIVITY_SCOPES[scope].flatMap((c) => [...ACTIVITY_CATEGORY_TYPES[c]]));
}

export function activityFacetsFor(scope: ActivityScope): FacetDef[] {
  return [
    {
      kind: "pills",
      field: "category",
      label: "Type",
      options: ACTIVITY_SCOPES[scope].map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
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
}

const num = (v: string | null): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function filterActivityRows<
  T extends { type: string; createdAt: number; actorKind: "system" | "staff" | "customer" },
>(rows: T[], params: URLSearchParams, scope?: ActivityScope): T[] {
  let out = rows;

  if (scope) {
    const inScope = activityTypesInScope(scope);
    out = out.filter((row) => inScope.has(row.type));
  }

  const category = params.get("category");
  // A category pill from the other scope's URL must not leak rows in: intersect rather
  // than replace, so ?category=payments on the subscription log yields nothing, not
  // every payment row.
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
