/**
 * Two-level support ticket taxonomy — the single source of truth for the customer
 * picker, server-side validation, and admin/analytics labels.
 *
 * Category values are `ticket_category` enum members. Three of them predate this
 * taxonomy and are deliberately reused rather than replaced (`order`, `billing`,
 * `general`) so ticket analytics stay continuous across the change instead of
 * splitting into near-duplicate buckets.
 *
 * `catering` is intentionally absent: it is a legacy enum value with no home in
 * the current taxonomy. Old tickets keep it (see LEGACY_CATEGORY_LABEL) but it is
 * no longer offered to customers. Postgres cannot drop an enum value without
 * rewriting every dependent column, so it stays in the type forever.
 *
 * Sub-category is stored as free `text` rather than an enum: 50+ values across 9
 * groups would make every future taxonomy tweak a migration. Validation happens
 * here instead, in `isValidPair`.
 */

/** Categories offered in the customer picker, in display order. */
export const TICKET_CATEGORIES = [
  "food_meal",
  "delivery",
  "plan_subscription",
  "billing",
  "order",
  "packaging",
  "account_website",
  "feedback",
  "general",
] as const;

export type TicketCategoryValue = (typeof TICKET_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<TicketCategoryValue, string> = {
  food_meal: "Food & Meal",
  delivery: "Delivery",
  plan_subscription: "Plan / Subscription",
  billing: "Billing & Payment",
  order: "Order",
  packaging: "Packaging",
  account_website: "Account / Website",
  feedback: "Feedback & Suggestions",
  general: "Other",
};

/**
 * Enum values that exist on historical rows but are no longer selectable.
 * Display surfaces merge these over CATEGORY_LABEL so old tickets still read well.
 */
export const LEGACY_CATEGORY_LABEL: Record<string, string> = {
  catering: "Catering",
};

export type SubcategoryOption = { value: string; label: string };

/**
 * Sub-categories keyed by category. Values are unique within their category only —
 * always group analytics by the (category, subcategory) pair, never subcategory alone.
 */
export const SUBCATEGORIES: Record<TicketCategoryValue, readonly SubcategoryOption[]> = {
  food_meal: [
    { value: "food_quality", label: "Food quality" },
    { value: "food_quantity", label: "Food quantity" },
    { value: "missing_item", label: "Missing item" },
    { value: "wrong_meal", label: "Wrong meal" },
    { value: "dietary_preference", label: "Dietary preference" },
    { value: "food_feedback", label: "Food feedback" },
  ],
  delivery: [
    { value: "not_delivered", label: "Tiffin not delivered" },
    { value: "late_delivery", label: "Late delivery" },
    { value: "wrong_location", label: "Wrong location" },
    { value: "wrong_date", label: "Wrong date" },
    { value: "delivery_instructions", label: "Delivery instructions" },
    { value: "tracking", label: "Tracking" },
    { value: "delivery_experience", label: "Delivery experience" },
  ],
  plan_subscription: [
    { value: "pause", label: "Pause" },
    { value: "resume", label: "Resume" },
    { value: "skip", label: "Skip" },
    { value: "change_plan", label: "Change plan" },
    { value: "meal_preference", label: "Meal preference" },
    { value: "extend", label: "Extend" },
    { value: "cancel", label: "Cancel" },
    { value: "renewal", label: "Renewal" },
  ],
  billing: [
    { value: "payment_failed", label: "Payment failed" },
    { value: "incorrect_charge", label: "Incorrect charge" },
    { value: "duplicate_charge", label: "Duplicate charge" },
    { value: "refund", label: "Refund" },
    { value: "coupon_discount", label: "Coupon / discount" },
    { value: "invoice", label: "Invoice" },
    { value: "renewal_charge", label: "Renewal charge" },
  ],
  order: [
    { value: "wrong_order", label: "Wrong order" },
    { value: "modification", label: "Modification" },
    { value: "cancellation", label: "Cancellation" },
    { value: "order_missing", label: "Order missing" },
    { value: "incorrect_order_details", label: "Incorrect order details" },
  ],
  packaging: [
    { value: "leaking", label: "Leaking" },
    { value: "damaged", label: "Damaged" },
    { value: "food_spilled", label: "Food spilled" },
    { value: "container_issue", label: "Container issue" },
    { value: "packaging_quality", label: "Packaging quality" },
  ],
  account_website: [
    { value: "login_signup", label: "Login / signup" },
    { value: "address", label: "Address" },
    { value: "place_order", label: "Place order" },
    { value: "website_error", label: "Website error" },
    { value: "payment_page", label: "Payment page" },
    { value: "order_not_showing", label: "Order not showing" },
    { value: "other_technical", label: "Other technical issue" },
  ],
  feedback: [
    { value: "food_suggestion", label: "Food suggestion" },
    { value: "menu_suggestion", label: "Menu suggestion" },
    { value: "delivery_suggestion", label: "Delivery suggestion" },
    { value: "feature_request", label: "Feature request" },
    { value: "compliment", label: "Compliment" },
    { value: "general_feedback", label: "General feedback" },
  ],
  general: [{ value: "something_else", label: "Something else" }],
};

const CATEGORY_SET = new Set<string>(TICKET_CATEGORIES);

export function isTicketCategory(value: string): value is TicketCategoryValue {
  return CATEGORY_SET.has(value);
}

/** A sub-category is only valid inside the category it belongs to. */
export function isValidPair(category: string, subcategory: string): boolean {
  if (!isTicketCategory(category)) return false;
  return SUBCATEGORIES[category].some((s) => s.value === subcategory);
}

/** Human label for any category value, including retired ones on historical rows. */
export function categoryLabel(value: string): string {
  return CATEGORY_LABEL[value as TicketCategoryValue] ?? LEGACY_CATEGORY_LABEL[value] ?? value;
}

/** Human label for a sub-category within its category; falls back to the raw value. */
export function subcategoryLabel(category: string, subcategory: string | null): string | null {
  if (!subcategory) return null;
  if (!isTicketCategory(category)) return subcategory;
  return SUBCATEGORIES[category].find((s) => s.value === subcategory)?.label ?? subcategory;
}
