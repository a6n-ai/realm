
export interface MealSizeView {
  id: bigint;
  publicId: string;
  key: string;
  name: string;
  description: string | null;
  // Scopes the size to exactly one plan. planId is server-only (FK resolution);
  // planKey crosses the wire so the client filters sizes by their owning plan.
  planId: bigint;
  planKey: string;
  tier: "budget" | "medium" | "premium";
  components: string[];
  // planKey: the row's own diet (a non-veg size can carry a veg sabzi row); undefined if its plan is inactive.
  items: { name: string; category: string; tuAmount: number; planKey?: string; maxTuAmount: number | null; portion: string | null }[];
  kcalMin: number;
  kcalMax: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  basePrice: number;
  discountType: "none" | "percent" | "flat";
  discountValue: number;
  trial: boolean;
  // Hidden per-composition size (lib/custom-meal). Never listed in pickers; see listableMealSizes.
  custom: boolean;
  // False only for a custom size its pricing can no longer price; buildPricingCatalog refuses it.
  priceable: boolean;
  // Holds a category flagged as a weekend dish; without one, Sat/Sun can't be eating days.
  servesWeekends: boolean;
}

/** Sizes a picker may offer: every catalog size, plus the one custom size `keepId` names (a renewal). */
export function listableMealSizes<T extends { custom: boolean; publicId: string; priceable?: boolean }>(sizes: T[], keepId?: string | null): T[] {
  return sizes.filter((m) => !m.custom || (keepId != null && m.publicId === keepId && m.priceable !== false));
}

// Active, in-window rows of the central `discounts` table. targetPublicId null = all rows of that kind.
export interface CatalogDiscount {
  key: string;
  name: string;
  kind: "delivery" | "duration";
  targetPublicId: string | null;
  percent: number;
  minWeeks: number | null;
}

export const WAIVER_KINDS = ["waiver_delivery", "waiver_base", "waiver_strategy", "waiver_tax"] as const;
export type WaiverKind = (typeof WAIVER_KINDS)[number];

// Active, in-window fee waivers. targetPublicId is the strategy for waiver_strategy, else null.
export interface CatalogWaiver {
  key: string;
  /** Admin-given name, shown to the customer as the bill line ("Launch offer"). */
  name: string;
  kind: WaiverKind;
  targetPublicId: string | null;
  percent: number;
}

// Server-side snapshot: carries BOTH the internal bigint id (for FK resolution
// in createOrder) and the public_id. The bigint id never leaves the server.
/** A tag: the kind of place (Home, Apartment, Office). Customers pick one, then its strategies. */
export interface StrategyGroupView {
  publicId: string;
  name: string;
  description: string | null;
}

/** Strategies of one tag the customer picks at most one of. */
export interface StrategyConnectionView {
  publicId: string;
  name: string;
  /** Tag public id. */
  groupId: string;
}

export interface CatalogSnapshot {
  plans: { id: bigint; publicId: string; key: string; name: string; description: string | null; planType: "tiffin" | "healthy"; offeredSlots: string[]; allowedStartDays: string[] }[];
  mealSizes: MealSizeView[];
  frequencies: { id: bigint; publicId: string; key: string; name: string; daysPerWeek: number; weekdays: string[] | null }[];
  durations: { id: bigint; publicId: string; weeks: number }[];
  zones: { id: bigint; publicId: string; name: string; radiusKm: number | null; postalPrefixes: string[]; slotWindow: string | null; active: boolean }[];
  // category key -> display label. Same source the customer day view threads into
  // day-detail.tsx (dishCategoriesService), so a swap's category reads the same
  // whether it's on the calendar or in the subscribe wizard. Optional so existing
  // fixtures/tests that build a snapshot by hand don't all need updating; callers
  // fall back to the raw category key when it's absent.
  categoryLabels?: Record<string, string>;
  // dish-category key -> add-ons an admin attached to it (dishCategoryAddonCategories).
  // An add-on only shows for a meal size when its key appears here under one of
  // that meal size's item categories — see buildPricingCatalog. Optional for the
  // same back-compat reason as categoryLabels.
  addonsByCategory?: Record<string, { key: string; name: string; pricePerWeek: number; maxQty: number }[]>;
  minTiffinsPerWeek?: number;
  maxTiffinsPerWeek?: number;
  discounts?: CatalogDiscount[];
  waivers?: CatalogWaiver[];
  maxDiscountPct?: number;
  deliveryCharges?: {
    baseCharge: number;
    /** Active tags; the customer picks at most one. */
    strategyGroups?: StrategyGroupView[];
    strategyConnections?: StrategyConnectionView[];
    /** Strategies under an active tag only. */
    deliveryStrategies: {
      id: bigint;
      publicId: string;
      name: string;
      description: string | null;
      chargeType: "none" | "fixed" | "percent";
      chargeValue: number;
      active: boolean;
      sortOrder: number;
      groupPublicId?: string | null;
      connectionPublicId?: string | null;
      /** Fixed charges: once per order or per delivery. Absent = once. */
      chargeBasis?: "once" | "per_delivery";
    }[];
    addressTags: {
      id: bigint;
      publicId: string;
      name: string;
      description: string | null;
      chargeType: "none" | "fixed" | "percent";
      chargeValue: number;
      active: boolean;
      sortOrder: number;
    }[];
  };
}

// Client-facing snapshot: no internal bigint id crosses the wire. Client
// components select by publicId (meal size) or business key (plan/frequency).
// Both server-only ids are stripped for the wire; the client selects by
// publicId and filters by the string planKey.
export type ClientMealSizeView = Omit<MealSizeView, "id" | "planId">;

export interface ClientCatalogSnapshot {
  plans: { publicId: string; key: string; name: string; description: string | null; planType: "tiffin" | "healthy"; offeredSlots: string[]; allowedStartDays: string[] }[];
  mealSizes: ClientMealSizeView[];
  frequencies: { publicId: string; key: string; name: string; daysPerWeek: number; weekdays: string[] | null }[];
  durations: { publicId: string; weeks: number }[];
  zones: { publicId: string; name: string; radiusKm: number | null; postalPrefixes: string[]; slotWindow: string | null; active: boolean }[];
  categoryLabels?: Record<string, string>;
  addonsByCategory?: Record<string, { key: string; name: string; pricePerWeek: number; maxQty: number }[]>;
  minTiffinsPerWeek?: number;
  maxTiffinsPerWeek?: number;
  discounts?: CatalogDiscount[];
  waivers?: CatalogWaiver[];
  maxDiscountPct?: number;
  deliveryCharges?: {
    baseCharge: number;
    strategyGroups: StrategyGroupView[];
    strategyConnections: StrategyConnectionView[];
    deliveryStrategies: {
      id: string; // publicId
      name: string;
      description: string | null;
      chargeType: "none" | "fixed" | "percent";
      chargeValue: number;
      groupId: string | null; // tag publicId
      connectionId: string | null; // connected set publicId
      chargeBasis: "once" | "per_delivery";
    }[];
    addressTags: {
      id: string; // publicId
      name: string;
      description: string | null;
      chargeType: "none" | "fixed" | "percent";
      chargeValue: number;
    }[];
  };
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
    categoryLabels: snapshot.categoryLabels,
    addonsByCategory: snapshot.addonsByCategory,
    minTiffinsPerWeek: snapshot.minTiffinsPerWeek,
    maxTiffinsPerWeek: snapshot.maxTiffinsPerWeek,
    discounts: snapshot.discounts,
    waivers: snapshot.waivers,
    maxDiscountPct: snapshot.maxDiscountPct,
    deliveryCharges: snapshot.deliveryCharges
      ? {
          baseCharge: snapshot.deliveryCharges.baseCharge,
          strategyGroups: snapshot.deliveryCharges.strategyGroups ?? [],
          strategyConnections: snapshot.deliveryCharges.strategyConnections ?? [],
          deliveryStrategies: snapshot.deliveryCharges.deliveryStrategies
            .filter((d) => d.active)
            .map((d) => ({
              id: d.publicId,
              name: d.name,
              description: d.description,
              chargeType: d.chargeType,
              chargeValue: d.chargeValue,
              groupId: d.groupPublicId ?? null,
              connectionId: d.connectionPublicId ?? null,
              chargeBasis: d.chargeBasis ?? "once",
            })),
          addressTags: snapshot.deliveryCharges.addressTags
            .filter((a) => a.active)
            .map((a) => ({
              id: a.publicId,
              name: a.name,
              description: a.description,
              chargeType: a.chargeType,
              chargeValue: a.chargeValue,
            })),
        }
      : undefined,
  };
}
