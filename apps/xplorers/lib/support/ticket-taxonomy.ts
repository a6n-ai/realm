/** Categories offered in the customer picker, in display order. */
export const TICKET_CATEGORIES = [
  "booking",
  "billing",
  "account_website",
  "feedback",
  "general",
] as const;

export type TicketCategoryValue = (typeof TICKET_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<TicketCategoryValue, string> = {
  booking: "Booking / class",
  billing: "Billing & payment",
  account_website: "Account / website",
  feedback: "Feedback",
  general: "Other",
};

export type SubcategoryOption = { value: string; label: string };

export const SUBCATEGORIES: Record<TicketCategoryValue, readonly SubcategoryOption[]> = {
  booking: [
    { value: "wrong_class", label: "Wrong class" },
    { value: "change_seats", label: "Change seats" },
    { value: "cancellation", label: "Cancellation" },
    { value: "reschedule", label: "Reschedule" },
    { value: "attendance", label: "Attendance" },
    { value: "booking_missing", label: "Booking missing" },
  ],
  billing: [
    { value: "payment_failed", label: "Payment failed" },
    { value: "incorrect_charge", label: "Incorrect charge" },
    { value: "refund", label: "Refund" },
    { value: "coins", label: "Coins / wallet" },
    { value: "coupon_discount", label: "Coupon / discount" },
    { value: "invoice", label: "Invoice / receipt" },
  ],
  account_website: [
    { value: "login_signup", label: "Login / signup" },
    { value: "username_friends", label: "Username / friends" },
    { value: "website_error", label: "Website error" },
    { value: "payment_page", label: "Payment page" },
    { value: "other_technical", label: "Other technical issue" },
  ],
  feedback: [
    { value: "class_suggestion", label: "Class suggestion" },
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

export function isValidPair(category: string, subcategory: string): boolean {
  if (!isTicketCategory(category)) return false;
  return SUBCATEGORIES[category].some((s) => s.value === subcategory);
}

export function categoryLabel(value: string): string {
  return CATEGORY_LABEL[value as TicketCategoryValue] ?? value;
}

export function subcategoryLabel(category: string, subcategory: string | null): string | null {
  if (!subcategory) return null;
  if (!isTicketCategory(category)) return subcategory;
  return SUBCATEGORIES[category].find((s) => s.value === subcategory)?.label ?? subcategory;
}
