// Plain module (no "use client") so both the server page and the client section
// components can import the shared order/labels without crossing the RSC value
// boundary.
//
// Menu IA (food-app style): this week's dishes → full dish gallery → slim plan CTA.
// Plans/meal-sizes live on Subscribe — listing them here duplicated big cards.

export type MenuSectionKey = "menu" | "dishes" | "plansCta";

export const MENU_SECTIONS: readonly { key: MenuSectionKey; title: string }[] = [
  { key: "menu", title: "This week's menu" },
  { key: "dishes", title: "All dishes" },
  { key: "plansCta", title: "Plans" },
];
