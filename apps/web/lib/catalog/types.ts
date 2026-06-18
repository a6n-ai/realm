export interface MealSizeView {
  id: string;
  key: string;
  name: string;
  tier: "budget" | "medium" | "premium";
  diet: "veg" | "nonveg" | "both";
  components: string[];
  kcalMin: number;
  kcalMax: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  basePrice: number;
}

export interface CatalogSnapshot {
  plans: { id: string; key: string; name: string; description: string | null }[];
  mealSizes: MealSizeView[];
  addons: { key: string; name: string; pricePerWeek: number }[];
  frequencies: { id: string; key: string; name: string; daysPerWeek: number; courierDiscountPct: number }[];
  durations: { id: string; weeks: number; discountPct: number }[];
  zones: { id: string; name: string; postalPrefixes: string[]; slotWindow: string; active: boolean }[];
}
