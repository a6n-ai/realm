// Plain module (no "use client") so both the server page and the client section
// components can import the shared order/labels without crossing the RSC value
// boundary.
//
// Menu IA (food-app style): released week's dishes → slim plan CTA. The full dish
// gallery ("All dishes") was dropped — plans/meal-sizes live on Subscribe, and
// this page answers "what's cooking" for the current or next released week.

export type MenuSectionKey = "menu" | "plansCta";

export const MENU_SECTIONS: readonly { key: MenuSectionKey; title: string }[] = [
  { key: "menu", title: "This week's menu" },
  { key: "plansCta", title: "Plans" },
];
