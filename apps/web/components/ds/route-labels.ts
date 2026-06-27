export const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  inquiries: "Inquiries",
  users: "Users",
  catalog: "Catalog",
  dishes: "Dishes",
  menus: "Weekly Menus",
  meals: "My Meals",
  account: "Account",
  settings: "Settings",
  order: "New order",
  design: "Design system",
  general: "General",
  "lead-sources": "Lead sources",
  "lead-assignment": "Lead assignment",
  "meal-types": "Meal types & slots",
  discounts: "Discounts",
  coupons: "Coupons",
  "rep-allowance": "Rep allowance",
  kinds: "Enabled kinds",
  profile: "Profile",
  contact: "Contact",
  address: "Delivery address",
  dietary: "Dietary & allergens",
  "delivery-notes": "Delivery notes",
  notifications: "Notifications",
  security: "Security",
};

export function labelForSegment(segment: string): string {
  return ROUTE_LABELS[segment] ?? segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
