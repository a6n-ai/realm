// Single source of truth for menu category ids/labels — used by the admin
// product form's category dropdown and by the public Menu page's grouping and
// section order. Categories aren't a DB-managed entity (see plan): the set is
// fixed and small, so a code constant is simpler than a categories table.
export type CategoryId =
  | "trad"
  | "fusion"
  | "vada"
  | "bhaji"
  | "rolls"
  | "momos"
  | "chaat"
  | "maggi"
  | "sandwich"
  | "drinks"
  | "hot"
  | "combos"
  | "bowl"
  | "fries"
  | "burgers"
  | "extra";

export const CATEGORY_IDS: CategoryId[] = [
  "trad",
  "fusion",
  "vada",
  "bhaji",
  "rolls",
  "momos",
  "chaat",
  "maggi",
  "sandwich",
  "drinks",
  "hot",
  "combos",
  "bowl",
  "fries",
  "burgers",
  "extra",
];

export const CATEGORIES: Record<CategoryId, { name: string; emoji: string; note: string }> = {
  trad: { name: "Traditional Puchkas", emoji: "💧", note: "The Kolkata classics. Crispy shells, spiced water." },
  fusion: { name: "Fusion Puchkas", emoji: "🔥", note: "Our viral hero. Global flavours, OG crunch." },
  vada: { name: "Vada Pav", emoji: "🥔", note: "Mumbai's spicy potato slider." },
  bhaji: { name: "Pav Bhaji", emoji: "🧈", note: "Buttery mashed-veg curry with toasted pav." },
  rolls: { name: "Kathi Rolls & Wraps", emoji: "🌯", note: "Flaky paratha, smoky fillings." },
  momos: { name: "Momos", emoji: "🥟", note: "Steamed or fried, with fiery chutney." },
  chaat: { name: "Chaats", emoji: "🥗", note: "Sweet, sour, spicy, crunchy — all at once." },
  maggi: { name: "Maggi", emoji: "🍜", note: "Late-night comfort, desi-style." },
  sandwich: { name: "Sandwiches", emoji: "🥪", note: "Grilled, buttered, Bombay-style." },
  drinks: { name: "Summer Drinks", emoji: "🥤", note: "Beat the GTA heat." },
  hot: { name: "Hot Drinks & Milkshakes", emoji: "☕", note: "Warm up or thicken up." },
  combos: { name: "Combos", emoji: "🍱", note: "Mix, match & save. Built for sharing." },
  bowl: { name: "Bowls", emoji: "🍚", note: "Rice bowls loaded with protein and sauce." },
  fries: { name: "Fries & Onion Rings", emoji: "🍟", note: "Crispy sides, loaded or classic." },
  burgers: { name: "Burgers", emoji: "🍔", note: "Handheld and loaded." },
  extra: { name: "Extras", emoji: "➕", note: "Add-ons for your order." },
};

export const TAG_STYLE: Record<string, { label: string; variant: string }> = {
  best: { label: "★ Best Seller", variant: "yellow" },
  viral: { label: "🔥 Viral", variant: "red" },
  new: { label: "New", variant: "mint" },
};
