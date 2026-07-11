import type { PricingTier } from "@/lib/pricing/tiers";

export interface MealSizeView {
  id: bigint;
  publicId: string;
  key: string;
  name: string;
  tier: "budget" | "medium" | "premium";
  diet: "veg" | "nonveg" | "both";
  components: string[];
  items: { name: string; category: string; qty: number; weightValue: number | null; weightUnit: "oz" | "g" | "ml" | "piece" | null }[];
  kcalMin: number;
  kcalMax: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  basePrice: number;
  trial: boolean;
}

// Server-side snapshot: carries BOTH the internal bigint id (for FK resolution
// in createOrder) and the public_id. The bigint id never leaves the server.
export interface CatalogSnapshot {
  // categoryCounts stays server-only: createOrder derives the authoritative
  // order.mealSlots from its keys rather than trusting client-submitted slots.
  plans: { id: bigint; publicId: string; key: string; name: string; description: string | null; planType: "tiffin" | "healthy"; offeredSlots: string[]; allowedStartDays: string[]; categoryCounts: Record<string, number> }[];
  mealSizes: MealSizeView[];
  frequencies: { id: bigint; publicId: string; key: string; name: string; daysPerWeek: number; courierDiscountPct: number }[];
  durations: { id: bigint; publicId: string; weeks: number; discountPct: number }[];
  zones: { id: bigint; publicId: string; name: string; postalPrefixes: string[]; slotWindow: string; active: boolean }[];
  tiers: PricingTier[];
}

// Client-facing snapshot: no internal bigint id crosses the wire. Client
// components select by publicId (meal size) or business key (plan/frequency).
export type ClientMealSizeView = Omit<MealSizeView, "id">;

export interface ClientCatalogSnapshot {
  plans: { publicId: string; key: string; name: string; description: string | null; planType: "tiffin" | "healthy"; offeredSlots: string[]; allowedStartDays: string[] }[];
  mealSizes: ClientMealSizeView[];
  frequencies: { publicId: string; key: string; name: string; daysPerWeek: number; courierDiscountPct: number }[];
  durations: { publicId: string; weeks: number; discountPct: number }[];
  zones: { publicId: string; name: string; postalPrefixes: string[]; slotWindow: string; active: boolean }[];
}

export function toClientCatalog(snapshot: CatalogSnapshot): ClientCatalogSnapshot {
  const dropId = <T extends { id: bigint }>(row: T): Omit<T, "id"> => {
    const { id: _id, ...rest } = row;
    return rest;
  };
  return {
    // categoryCounts is server-only (createOrder derives mealSlots from it) —
    // drop it here too so it never reaches the client bundle.
    plans: snapshot.plans.map(({ categoryCounts: _categoryCounts, ...rest }) => dropId(rest)),
    mealSizes: snapshot.mealSizes.map(dropId),
    frequencies: snapshot.frequencies.map(dropId),
    durations: snapshot.durations.map(dropId),
    zones: snapshot.zones.map(dropId),
  };
}
