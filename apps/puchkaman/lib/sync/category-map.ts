import type { CategoryId } from "@/lib/menu-categories";

// Uber Eats raw category label -> our CategoryId. "bowl"/"fries"/"burgers"/
// "extra" are real sections on the live menu that our original hand-typed 12
// categories never covered — added rather than force-fitting them elsewhere.
// "Beverages" isn't a 1:1 mapping (it mixes hot chai/milkshakes with cold
// drinks) so it's resolved per-item in sources/uber-eats-snapshot-source.ts,
// not here.
export const UBER_EATS_CATEGORY_MAP: Record<string, CategoryId> = {
  "Combo Deals": "combos",
  "Puchka or Panipuri or Golgappa": "trad",
  "Non Veg Fusion Puchka [Sauce based NO water]": "fusion",
  "Veg Fusion Puchka [Sauce based NO water]": "fusion",
  "Dessert Puchka": "fusion",
  Chaats: "chaat",
  "Vada Pav": "vada",
  "Pav Bhaji": "bhaji",
  Sandwich: "sandwich",
  Momo: "momos",
  "Wraps & Roll": "rolls",
  "Muri & Bhaja": "chaat",
  Maggi: "maggi",
  Milkshakes: "hot",
  Bowl: "bowl",
  "Fries & Onion Rings": "fries",
  Burgers: "burgers",
  Extra: "extra",
};
