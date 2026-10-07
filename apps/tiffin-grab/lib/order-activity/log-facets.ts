import type { FacetDef } from "@/components/ds";

/**
 * Settings → Logs categories. Splits address / moved-tiffin actions out of the
 * coarser "deliveries" bucket used on the per-order activity panel, so staff
 * can answer "who changed the address?" and "who moved a tiffin?" directly.
 *
 * Keep this module free of `@/db/schema` imports — the facet list is rendered
 * by a client component (`logs-table.tsx`).
 */
export const LOG_ACTIVITY_CATEGORY_TYPES = {
  meals: ["meal_pick", "category_swap_applied", "category_swap_removed"],
  address: ["delivery_address_changed"],
  tiffins: ["skipped", "unskipped", "pool_scheduled", "complimentary_granted"],
  routes: ["route_pushed", "route_completed"],
  lifecycle: ["created", "activated", "paused", "resumed", "cancelled", "status_change"],
  payments: ["payment_claimed", "payment_verified", "payment_rejected"],
  notes: ["note"],
} as const;

export type LogActivityCategory = keyof typeof LOG_ACTIVITY_CATEGORY_TYPES;

const CATEGORY_LABELS: Record<LogActivityCategory, string> = {
  meals: "Meals",
  address: "Address",
  tiffins: "Tiffins",
  routes: "Routes",
  lifecycle: "Lifecycle",
  payments: "Payments",
  notes: "Notes",
};

/** Every `order_activity_type` value — keep in sync with the pg enum. */
export const ACTIVITY_TYPE_VALUES = [
  "created",
  "status_change",
  "paused",
  "resumed",
  "cancelled",
  "activated",
  "meal_pick",
  "note",
  "skipped",
  "unskipped",
  "delivery_address_changed",
  "pool_scheduled",
  "payment_claimed",
  "payment_verified",
  "payment_rejected",
  "route_pushed",
  "route_completed",
  "category_swap_applied",
  "category_swap_removed",
  "complimentary_granted",
] as const;

export type ActivityTypeValue = (typeof ACTIVITY_TYPE_VALUES)[number];

/** Short labels for the Action multi-filter (exact type, not category). */
export const ACTIVITY_TYPE_LABELS: Record<ActivityTypeValue, string> = {
  created: "Order created",
  status_change: "Status change",
  paused: "Paused",
  resumed: "Resumed",
  cancelled: "Cancelled",
  activated: "Activated",
  meal_pick: "Meal pick",
  note: "Note",
  skipped: "Skipped / held",
  unskipped: "Un-skipped",
  delivery_address_changed: "Address changed",
  pool_scheduled: "Moved / scheduled tiffin",
  payment_claimed: "Payment submitted",
  payment_verified: "Payment verified",
  payment_rejected: "Payment rejected",
  route_pushed: "Sent to route",
  route_completed: "Route completed",
  category_swap_applied: "Category swap applied",
  category_swap_removed: "Category swap removed",
  complimentary_granted: "Free tiffin given",
};

export const SETTINGS_ACTIVITY_FACETS: FacetDef[] = [
  {
    kind: "pills",
    field: "category",
    label: "Type",
    options: (Object.keys(LOG_ACTIVITY_CATEGORY_TYPES) as LogActivityCategory[]).map((c) => ({
      value: c,
      label: CATEGORY_LABELS[c],
    })),
  },
  {
    kind: "multi",
    field: "type",
    label: "Action",
    options: ACTIVITY_TYPE_VALUES.map((t) => ({
      value: t,
      label: ACTIVITY_TYPE_LABELS[t],
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
  { kind: "dateRange", field: "createdAt", label: "When" },
  {
    kind: "search",
    fields: ["customerName", "actorName", "actorEmail", "note", "orderPublicId"],
  },
];
