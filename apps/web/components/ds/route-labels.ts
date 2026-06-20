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
  "meal-slots": "Meal slots",
  order: "New order",
  design: "Design system",
};

export function labelForSegment(segment: string): string {
  return ROUTE_LABELS[segment] ?? segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
