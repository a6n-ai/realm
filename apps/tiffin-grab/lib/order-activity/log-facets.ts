import type { FacetDef } from "@/components/ds";
import { orderActivityType } from "@/db/schema/orders";

/**
 * Settings → Logs categories. Splits address / moved-tiffin actions out of the
 * coarser "deliveries" bucket used on the per-order activity panel, so staff
 * can answer "who changed the address?" and "who moved a tiffin?" directly.
 */
export const LOG_ACTIVITY_CATEGORY_TYPES = {
  meals: ["meal_pick", "category_swap_applied", "category_swap_removed"],
  address: ["delivery_address_changed"],
  tiffins: ["skipped", "unskipped", "pool_scheduled"],
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

/** Short labels for the Action multi-filter (exact type, not category). */
export const ACTIVITY_TYPE_LABELS: Record<(typeof orderActivityType.enumValues)[number], string> = {
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
    options: orderActivityType.enumValues.map((t) => ({
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
