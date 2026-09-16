// Plain module (no "use client") so both the server page and the client section
// components can import the shared order/labels without crossing the RSC value
// boundary.
//
// Menu IA (food-app style): this week's dishes → slim plan CTA. The full dish
// gallery ("All dishes") was dropped — plans/meal-sizes live on Subscribe, and
// this week's menu is already the answer to "what's cooking".

export type MenuSectionKey = "menu" | "plansCta";

export const MENU_SECTIONS: readonly { key: MenuSectionKey; title: string }[] = [
  { key: "menu", title: "This week's menu" },
  { key: "plansCta", title: "Plans" },
];
