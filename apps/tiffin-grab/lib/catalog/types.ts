import type { PricingTier } from "@/lib/pricing/tiers";

export interface MealSizeView {
  id: bigint;
  publicId: string;
  key: string;
  name: string;
  // Scopes the size to exactly one plan. planId is server-only (FK resolution);
  // planKey crosses the wire so the client filters sizes by their owning plan.
  planId: bigint;
  planKey: string;
  tier: "budget" | "medium" | "premium";
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
  plans: { id: bigint; publicId: string; key: string; name: string; description: string | null; planType: "tiffin" | "healthy"; offeredSlots: string[]; allowedStartDays: string[] }[];
  mealSizes: MealSizeView[];
  frequencies: { id: bigint; publicId: string; key: string; name: string; daysPerWeek: number; courierDiscountPct: number }[];
  durations: { id: bigint; publicId: string; weeks: number; discountPct: number }[];
  zones: { id: bigint; publicId: string; name: string; postalPrefixes: string[]; slotWindow: string; active: boolean }[];
  tiers: PricingTier[];
}

// Client-facing snapshot: no internal bigint id crosses the wire. Client
// components select by publicId (meal size) or business key (plan/frequency).
// Both server-only ids are stripped for the wire; the client selects by
// publicId and filters by the string planKey.
export type ClientMealSizeView = Omit<MealSizeView, "id" | "planId">;

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
  const dropMealIds = (row: MealSizeView): ClientMealSizeView => {
    const { id: _id, planId: _planId, ...rest } = row;
    return rest;
  };
  return {
    plans: snapshot.plans.map(dropId),
    mealSizes: snapshot.mealSizes.map(dropMealIds),
    frequencies: snapshot.frequencies.map(dropId),
    durations: snapshot.durations.map(dropId),
    zones: snapshot.zones.map(dropId),
  };
}
