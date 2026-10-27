// The icons staff can pick for a dish category (dish_categories.icon). A fixed list, not free text, so a
// saved name always has a drawing: components/wizard/addons-panel.tsx maps each name to its Lucide icon.
export const CATEGORY_ICONS = [
  "salad", "soup", "wheat", "leaf", "carrot", "bean", "egg", "drumstick", "beef", "fish",
  "flame", "sandwich", "croissant", "cake-slice", "cookie", "ice-cream", "cup-soda", "milk", "sparkles",
] as const;

export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export const CATEGORY_ICON_LABELS: Record<CategoryIcon, string> = {
  salad: "Salad", soup: "Bowl", wheat: "Grain", leaf: "Leaf", carrot: "Vegetable", bean: "Bean", egg: "Egg",
  drumstick: "Chicken", beef: "Meat", fish: "Fish", flame: "Spicy", sandwich: "Sandwich", croissant: "Bread",
  "cake-slice": "Dessert", cookie: "Snack", "ice-cream": "Ice cream", "cup-soda": "Drink", milk: "Dairy", sparkles: "Extra",
};
