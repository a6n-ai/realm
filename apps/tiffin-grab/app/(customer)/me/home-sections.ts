// Plain module (no "use client") so both the server page and the client section
// components can import the shared order/labels without crossing the RSC value
// boundary. Order is Resolved-Decision-#2: subscription · browse · coupons ·
// wallet · analytics.

export type HomeSectionKey = "subscription" | "menu" | "mealSizes" | "dishes" | "browse" | "coupons" | "wallet" | "analytics";

export const HOME_SECTIONS: readonly { key: HomeSectionKey; title: string }[] = [
  { key: "subscription", title: "Your subscription" },
  { key: "menu", title: "This week's menu" },
  { key: "mealSizes", title: "Meal sizes" },
  { key: "dishes", title: "Dishes" },
  { key: "browse", title: "Browse plans" },
  { key: "coupons", title: "Available coupons" },
  { key: "wallet", title: "Wallet" },
  { key: "analytics", title: "Your activity" },
];
