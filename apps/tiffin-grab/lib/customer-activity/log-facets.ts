import type { FacetDef } from "@/components/ds";

export const CUSTOMER_ACTIVITY_CATEGORY_ACTIONS = {
  meals: ["meal_saved", "meal_customization_saved"],
  addresses: [
    "delivery_address_changed",
    "address_added",
    "address_updated",
    "default_address_changed",
    "address_removed",
    "address_preferences_saved",
  ],
  schedule: [
    "tiffin_held",
    "tiffin_restored",
    "tiffin_rescheduled",
    "vacation_started",
    "vacation_ended",
    "subscription_cancelled",
  ],
  payments: ["payment_submitted"],
  preferences: ["dietary_preferences_saved", "delivery_notes_saved"],
} as const;

export type CustomerActivityCategory = keyof typeof CUSTOMER_ACTIVITY_CATEGORY_ACTIONS;
export type CustomerActivityAction =
  (typeof CUSTOMER_ACTIVITY_CATEGORY_ACTIONS)[CustomerActivityCategory][number];

export const CUSTOMER_ACTIVITY_ACTION_LABELS: Record<CustomerActivityAction, string> = {
  meal_saved: "Meal saved",
  meal_customization_saved: "Meal customization saved",
  delivery_address_changed: "Delivery address changed",
  address_added: "Address added",
  address_updated: "Address updated",
  default_address_changed: "Default address changed",
  address_removed: "Address removed",
  address_preferences_saved: "Address preferences saved",
  tiffin_held: "Tiffin held",
  tiffin_restored: "Tiffin restored",
  tiffin_rescheduled: "Tiffin rescheduled",
  vacation_started: "Vacation started",
  vacation_ended: "Vacation ended",
  subscription_cancelled: "Subscription cancelled",
  payment_submitted: "Payment submitted",
  dietary_preferences_saved: "Dietary preferences saved",
  delivery_notes_saved: "Delivery notes saved",
};

export const CUSTOMER_ACTIVITY_CATEGORY_LABELS: Record<CustomerActivityCategory, string> = {
  meals: "Meals",
  addresses: "Addresses",
  schedule: "Delivery schedule",
  payments: "Payments",
  preferences: "Preferences",
};

export const CUSTOMER_ACTIVITY_ACTIONS = Object.values(
  CUSTOMER_ACTIVITY_CATEGORY_ACTIONS,
).flat() as CustomerActivityAction[];

export const CUSTOMER_ACTIVITY_FACETS: FacetDef[] = [
  {
    kind: "multi",
    field: "category",
    label: "Type",
    options: (Object.keys(CUSTOMER_ACTIVITY_CATEGORY_ACTIONS) as CustomerActivityCategory[]).map(
      (category) => ({
        value: category,
        label: CUSTOMER_ACTIVITY_CATEGORY_LABELS[category],
      }),
    ),
  },
  {
    kind: "multi",
    field: "action",
    label: "Action",
    options: CUSTOMER_ACTIVITY_ACTIONS.map((action) => ({
      value: action,
      label: CUSTOMER_ACTIVITY_ACTION_LABELS[action],
    })),
  },
  { kind: "dateRange", field: "createdAt", label: "When" },
  {
    kind: "search",
    fields: ["customerName", "customerEmail", "details", "orderPublicId", "entityPublicId"],
  },
];

export function categoryForCustomerAction(
  action: CustomerActivityAction,
): CustomerActivityCategory {
  for (const [category, actions] of Object.entries(CUSTOMER_ACTIVITY_CATEGORY_ACTIONS)) {
    if ((actions as readonly string[]).includes(action)) {
      return category as CustomerActivityCategory;
    }
  }
  throw new Error(`Unknown customer activity action: ${action}`);
}
