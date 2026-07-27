/**
 * Clover Inventory API types + money helpers.
 *
 * Platform paths (sandbox `apisandbox.dev.clover.com`, prod `api.clover.com`):
 * - GET/POST  /v3/merchants/{mId}/items
 * - GET/POST  /v3/merchants/{mId}/items/{itemId}  (POST = update)
 * - DELETE    /v3/merchants/{mId}/items/{itemId}
 * - GET/POST  /v3/merchants/{mId}/categories
 * - POST      /v3/merchants/{mId}/categories/{categoryId}  (update)
 * - DELETE    /v3/merchants/{mId}/categories/{categoryId}
 * - POST      /v3/merchants/{mId}/category_items  (?delete=true to unlink)
 * - GET/POST  /v3/merchants/{mId}/modifier_groups  (expand=modifiers,items)
 * - POST      /v3/merchants/{mId}/modifier_groups/{modGroupId}
 * - GET/POST  /v3/merchants/{mId}/modifiers
 * - POST      /v3/merchants/{mId}/item_modifier_groups  (?delete=true to unlink)
 * - GET/POST  /v3/merchants/{mId}/discounts
 * - POST      /v3/merchants/{mId}/discounts/{discountId}
 * - PUT       /v3/merchants/{mId}/item_stocks/{itemId}
 *
 * Note: Clover Register has no separate "Menus" inventory resource — Register
 * menus are Categories + category_items. Local `menus` mirror that layout.
 *
 * Auth: `Authorization: Bearer {access_token}`. Prices/amounts are integer cents.
 * Expand: `categories`, `itemStock`, `modifierGroups`, `modifiers`, `items`, …
 */

export type CloverPriceType = "FIXED" | "VARIABLE" | "PER_UNIT";

export type CloverCategoryRef = {
  id: string;
  name?: string;
  colorCode?: string | null;
};

export type CloverItemStock = {
  item?: { id?: string };
  quantity?: number;
  modifiedTime?: number;
};

/** Inventory item as returned by Platform API `/items`. */
export type CloverItem = {
  id: string;
  name: string;
  /** Price in cents. */
  price: number;
  priceType?: CloverPriceType | string;
  hidden?: boolean;
  available?: boolean;
  autoManage?: boolean;
  code?: string | null;
  sku?: string | null;
  alternateName?: string | null;
  /** Merchant cost in cents. */
  cost?: number | null;
  /** Unit of measure (e.g. lb, oz, each). */
  unitName?: string | null;
  /** Hex color, e.g. `#FF0080`. */
  colorCode?: string | null;
  modifiedTime?: number;
  /** Present when `expand=categories`. */
  categories?: { elements?: CloverCategoryRef[] };
  /** Present when `expand=itemStock`. */
  itemStock?: CloverItemStock;
  /** Present when `expand=modifierGroups`. */
  modifierGroups?: { elements?: CloverModifierGroupRef[] };
};

export type CloverItemCreateInput = {
  name: string;
  /** Price in cents. */
  price: number;
  priceType?: CloverPriceType;
  hidden?: boolean;
  available?: boolean;
  autoManage?: boolean;
  code?: string | null;
  sku?: string | null;
  alternateName?: string | null;
  /** Merchant cost in cents. */
  cost?: number | null;
  unitName?: string | null;
  colorCode?: string | null;
};

export type CloverItemUpdateInput = Partial<CloverItemCreateInput> & {
  id?: string;
};

/** Category as returned by `/categories` (Register menu section). */
export type CloverCategory = {
  id: string;
  name: string;
  sortOrder?: number;
  /** Hex color for Register tiles, e.g. `#FF0080`. */
  colorCode?: string | null;
  deleted?: boolean;
  modifiedTime?: number;
  parentCategory?: { id: string } | null;
  /** Present when `expand=items`. */
  items?: { elements?: Array<{ id: string }> };
};

export type CloverCategoryCreateInput = {
  name: string;
  sortOrder?: number;
  colorCode?: string | null;
};

export type CloverCategoryUpdateInput = Partial<CloverCategoryCreateInput> & {
  id?: string;
};

export type CloverModifierGroupRef = {
  id: string;
  name?: string;
};

/** Modifier group (`/modifier_groups`). */
export type CloverModifierGroup = {
  id: string;
  name: string;
  alternateName?: string | null;
  minRequired?: number | null;
  maxAllowed?: number | null;
  showByDefault?: boolean;
  sortOrder?: number;
  deleted?: boolean;
  modifiedTime?: number;
  /** Present when `expand=modifiers`. */
  modifiers?: { elements?: CloverModifier[] };
  /** Present when `expand=items`. */
  items?: { elements?: Array<{ id: string }> };
};

export type CloverModifierGroupCreateInput = {
  name: string;
  alternateName?: string | null;
  minRequired?: number | null;
  maxAllowed?: number | null;
  showByDefault?: boolean;
  sortOrder?: number;
};

export type CloverModifierGroupUpdateInput = Partial<CloverModifierGroupCreateInput> & {
  id?: string;
};

/** Modifier within a group (`/modifiers` or expanded on a group). */
export type CloverModifier = {
  id: string;
  name: string;
  alternateName?: string | null;
  /** Additional cost in cents. */
  price?: number;
  available?: boolean;
  deleted?: boolean;
  modifiedTime?: number;
  modifierGroup?: { id: string };
};

export type CloverModifierCreateInput = {
  name: string;
  /** Modifier group this modifier belongs to. */
  modifierGroup: { id: string };
  alternateName?: string | null;
  /** Additional cost in cents. */
  price?: number;
  available?: boolean;
};

export type CloverModifierUpdateInput = Partial<Omit<CloverModifierCreateInput, "modifierGroup">> & {
  id?: string;
  modifierGroup?: { id: string };
};

/**
 * Inventory discount (`/discounts`).
 * Either `percentage` (0–100) or fixed `amount` in cents (often negative).
 */
export type CloverDiscount = {
  id: string;
  name: string;
  /** Fixed discount amount in cents (negative = deduction). */
  amount?: number | null;
  /** Percent off (0–100). */
  percentage?: number | null;
  deleted?: boolean;
  modifiedTime?: number;
};

export type CloverDiscountCreateInput = {
  name: string;
  amount?: number | null;
  percentage?: number | null;
};

export type CloverDiscountUpdateInput = Partial<CloverDiscountCreateInput> & {
  id?: string;
};

export type CloverElements<T> = {
  elements: T[];
  href?: string;
};

export type ListItemsParams = {
  limit?: number;
  offset?: number;
  /** Comma-separated expansions, e.g. `categories,itemStock`. */
  expand?: string;
  filter?: string;
};

export type ListInventoryParams = {
  limit?: number;
  offset?: number;
  expand?: string;
  filter?: string;
};

/** Convert local dollars (e.g. 12.99) to Clover integer cents. */
export function dollarsToCloverCents(dollars: number): number {
  if (!Number.isFinite(dollars)) throw new Error("Invalid dollar amount");
  return Math.round(dollars * 100);
}

/** Convert Clover integer cents to dollars. */
export function cloverCentsToDollars(cents: number): number {
  if (!Number.isFinite(cents)) throw new Error("Invalid cents amount");
  return Math.round(cents) / 100;
}

function optString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return typeof v === "string" ? v : undefined;
}

function optBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function optNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v != null && v !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function optNullableNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return optNumber(v) ?? undefined;
}

function elementsOf<T>(
  raw: unknown,
  map: (el: Record<string, unknown>) => T | null,
): { elements: T[] } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const els = (raw as { elements?: unknown }).elements;
  if (!Array.isArray(els)) return undefined;
  const elements = els
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map(map)
    .filter((e): e is T => e != null);
  return { elements };
}

/** Normalize a raw Platform API item into a typed CloverItem (throws if id/name missing). */
export function normalizeCloverItem(raw: unknown): CloverItem {
  if (!raw || typeof raw !== "object") throw new Error("Invalid Clover item payload");
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const name = typeof o.name === "string" ? o.name : "";
  if (!id || !name) throw new Error("Clover item missing id or name");
  const price = typeof o.price === "number" ? o.price : Number(o.price);
  if (!Number.isFinite(price)) throw new Error(`Clover item ${id} has invalid price`);

  const categories = elementsOf(o.categories, (e) => {
    const cid = typeof e.id === "string" ? e.id : "";
    if (!cid) return null;
    return {
      id: cid,
      name: typeof e.name === "string" ? e.name : undefined,
      colorCode: optString(e.colorCode),
    };
  });

  const modifierGroups = elementsOf(o.modifierGroups, (e) => {
    const gid = typeof e.id === "string" ? e.id : "";
    if (!gid) return null;
    return {
      id: gid,
      name: typeof e.name === "string" ? e.name : undefined,
    };
  });

  const costRaw = o.cost;
  const cost =
    typeof costRaw === "number"
      ? costRaw
      : costRaw === null
        ? null
        : costRaw !== undefined && Number.isFinite(Number(costRaw))
          ? Number(costRaw)
          : undefined;

  return {
    id,
    name,
    price,
    priceType: typeof o.priceType === "string" ? o.priceType : undefined,
    hidden: optBool(o.hidden),
    available: optBool(o.available),
    autoManage: optBool(o.autoManage),
    code: optString(o.code),
    sku: optString(o.sku),
    alternateName: optString(o.alternateName),
    cost,
    unitName: optString(o.unitName),
    colorCode: optString(o.colorCode),
    modifiedTime: optNumber(o.modifiedTime),
    categories,
    itemStock:
      o.itemStock && typeof o.itemStock === "object"
        ? (o.itemStock as CloverItemStock)
        : undefined,
    modifierGroups,
  };
}

export function normalizeCloverCategory(raw: unknown): CloverCategory {
  if (!raw || typeof raw !== "object") throw new Error("Invalid Clover category payload");
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const name = typeof o.name === "string" ? o.name : "";
  if (!id || !name) throw new Error("Clover category missing id or name");

  const parentRaw = o.parentCategory;
  let parentCategory: CloverCategory["parentCategory"];
  if (parentRaw === null) parentCategory = null;
  else if (parentRaw && typeof parentRaw === "object") {
    const pid = (parentRaw as { id?: unknown }).id;
    parentCategory = typeof pid === "string" && pid ? { id: pid } : undefined;
  }

  return {
    id,
    name,
    sortOrder: optNumber(o.sortOrder),
    colorCode: optString(o.colorCode),
    deleted: optBool(o.deleted),
    modifiedTime: optNumber(o.modifiedTime),
    parentCategory,
    items: elementsOf(o.items, (e) => {
      const iid = typeof e.id === "string" ? e.id : "";
      return iid ? { id: iid } : null;
    }),
  };
}

export function normalizeCloverModifier(raw: unknown): CloverModifier {
  if (!raw || typeof raw !== "object") throw new Error("Invalid Clover modifier payload");
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const name = typeof o.name === "string" ? o.name : "";
  if (!id || !name) throw new Error("Clover modifier missing id or name");

  const groupRaw = o.modifierGroup;
  let modifierGroup: CloverModifier["modifierGroup"];
  if (groupRaw && typeof groupRaw === "object") {
    const gid = (groupRaw as { id?: unknown }).id;
    if (typeof gid === "string" && gid) modifierGroup = { id: gid };
  }

  return {
    id,
    name,
    alternateName: optString(o.alternateName),
    price: optNumber(o.price) ?? 0,
    available: optBool(o.available),
    deleted: optBool(o.deleted),
    modifiedTime: optNumber(o.modifiedTime),
    modifierGroup,
  };
}

export function normalizeCloverModifierGroup(raw: unknown): CloverModifierGroup {
  if (!raw || typeof raw !== "object") throw new Error("Invalid Clover modifier group payload");
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const name = typeof o.name === "string" ? o.name : "";
  if (!id || !name) throw new Error("Clover modifier group missing id or name");

  const modifiersRaw = o.modifiers;
  let modifiers: CloverModifierGroup["modifiers"];
  if (modifiersRaw && typeof modifiersRaw === "object") {
    const els = (modifiersRaw as { elements?: unknown }).elements;
    if (Array.isArray(els)) {
      modifiers = {
        elements: els
          .filter((e) => e && typeof e === "object")
          .map((e) => {
            try {
              return normalizeCloverModifier(e);
            } catch {
              return null;
            }
          })
          .filter((e): e is CloverModifier => e != null),
      };
    }
  }

  return {
    id,
    name,
    alternateName: optString(o.alternateName),
    minRequired: optNullableNumber(o.minRequired),
    maxAllowed: optNullableNumber(o.maxAllowed),
    showByDefault: optBool(o.showByDefault),
    sortOrder: optNumber(o.sortOrder),
    deleted: optBool(o.deleted),
    modifiedTime: optNumber(o.modifiedTime),
    modifiers,
    items: elementsOf(o.items, (e) => {
      const iid = typeof e.id === "string" ? e.id : "";
      return iid ? { id: iid } : null;
    }),
  };
}

export function normalizeCloverDiscount(raw: unknown): CloverDiscount {
  if (!raw || typeof raw !== "object") throw new Error("Invalid Clover discount payload");
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const name = typeof o.name === "string" ? o.name : "";
  if (!id || !name) throw new Error("Clover discount missing id or name");
  return {
    id,
    name,
    amount: optNullableNumber(o.amount),
    percentage: optNullableNumber(o.percentage),
    deleted: optBool(o.deleted),
    modifiedTime: optNumber(o.modifiedTime),
  };
}

/** Primary category name from an expanded item (first element), if any. */
export function primaryCategoryName(item: CloverItem): string | null {
  const name = item.categories?.elements?.[0]?.name;
  return name && name.trim() ? name.trim() : null;
}
