// Plain module (no "use client") so both the server page and the client section
// components can import the shared order/labels without crossing the RSC value
// boundary. Mirrors home-sections.ts's catalog ordering: menu · mealSizes · dishes · browse.

export type MenuSectionKey = "menu" | "mealSizes" | "dishes" | "browse";

export const MENU_SECTIONS: readonly { key: MenuSectionKey; title: string }[] = [
  { key: "menu", title: "This week's menu" },
  { key: "mealSizes", title: "Meal sizes" },
  { key: "dishes", title: "Dishes" },
  { key: "browse", title: "Browse plans" },
];
