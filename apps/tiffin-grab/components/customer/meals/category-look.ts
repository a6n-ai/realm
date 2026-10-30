import { Bean, Beef, CakeSlice, Carrot, Cookie, Croissant, CupSoda, Drumstick, Egg, Fish, Flame, IceCreamCone, Leaf, Milk, Salad, Sandwich, Soup, Sparkles, UtensilsCrossed, Wheat, type LucideIcon } from "lucide-react";
import type { IconTint } from "@/components/customer/kit";
import type { CategoryIcon } from "@/lib/catalog/category-icons";

// Each dish category gets its own Settings-style tile; anything unknown takes the next unused colour.
const CATEGORY: Record<string, { icon: LucideIcon; tint: IconTint }> = {
  salad: { icon: Salad, tint: "green" },
  raita: { icon: Soup, tint: "cyan" },
  daal: { icon: Soup, tint: "orange" },
  curry: { icon: Soup, tint: "red" },
  sabzi: { icon: Leaf, tint: "mint" },
  roti: { icon: Wheat, tint: "brown" },
  rice: { icon: Wheat, tint: "yellow" },
  dessert: { icon: CakeSlice, tint: "pink" },
  sweet: { icon: CakeSlice, tint: "pink" },
  drink: { icon: CupSoda, tint: "blue" },
  beverage: { icon: CupSoda, tint: "blue" },
  extra: { icon: Sparkles, tint: "purple" },
};
const SPARE: IconTint[] = ["purple", "indigo", "teal", "gray"];
// Drawings for the icons staff pick on a category (dish_categories.icon); a pick beats the guess by key above.
const PICKED: Record<CategoryIcon, LucideIcon> = {
  salad: Salad, soup: Soup, wheat: Wheat, leaf: Leaf, carrot: Carrot, bean: Bean, egg: Egg, drumstick: Drumstick, beef: Beef, fish: Fish,
  flame: Flame, sandwich: Sandwich, croissant: Croissant, "cake-slice": CakeSlice, cookie: Cookie, "ice-cream": IceCreamCone, "cup-soda": CupSoda, milk: Milk, sparkles: Sparkles,
};

/** A fresh category → tile lookup; unknown categories take spare colours in the order they are asked for. */
export function makeCategoryLook() {
  let spare = 0;
  return (category: string, pickedIcon?: string | null) => {
    const guess = CATEGORY[category.toLowerCase()] ?? { icon: UtensilsCrossed, tint: SPARE[spare++ % SPARE.length]! };
    const picked = PICKED[pickedIcon as CategoryIcon];
    return picked ? { ...guess, icon: picked } : guess;
  };
}
