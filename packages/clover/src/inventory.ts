/**
 * Clover Inventory API types + money helpers.
 *
 * Platform paths (sandbox `apisandbox.dev.clover.com`, prod `api.clover.com`):
 * - GET/POST  /v3/merchants/{mId}/items
 * - GET/POST  /v3/merchants/{mId}/items/{itemId}  (POST = update)
 * - DELETE    /v3/merchants/{mId}/items/{itemId}
 * - GET/POST  /v3/merchants/{mId}/categories
 * - POST      /v3/merchants/{mId}/category_items  (?delete=true to unlink)
 * - PUT       /v3/merchants/{mId}/item_stocks/{itemId}  (stock qty via updateItemStock)
 *
 * Auth: `Authorization: Bearer {access_token}`. Prices are integer cents.
 * Expand: `categories`, `itemStock`, `modifierGroups`, `tags`, `taxRates`, …
 */

export type CloverPriceType = "FIXED" | "VARIABLE" | "PER_UNIT";

export type CloverCategoryRef = {
  id: string;
  name?: string;
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

export type CloverCategory = {
  id: string;
  name: string;
  sortOrder?: number;
  modifiedTime?: number;
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

/** Normalize a raw Platform API item into a typed CloverItem (throws if id/name missing). */
export function normalizeCloverItem(raw: unknown): CloverItem {
  if (!raw || typeof raw !== "object") throw new Error("Invalid Clover item payload");
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const name = typeof o.name === "string" ? o.name : "";
  if (!id || !name) throw new Error("Clover item missing id or name");
  const price = typeof o.price === "number" ? o.price : Number(o.price);
  if (!Number.isFinite(price)) throw new Error(`Clover item ${id} has invalid price`);

  const categoriesRaw = o.categories;
  let categories: CloverItem["categories"];
  if (categoriesRaw && typeof categoriesRaw === "object") {
    const els = (categoriesRaw as { elements?: unknown }).elements;
    if (Array.isArray(els)) {
      categories = {
        elements: els
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .map((e) => ({
            id: typeof e.id === "string" ? e.id : "",
            name: typeof e.name === "string" ? e.name : undefined,
          }))
          .filter((e) => e.id),
      };
    }
  }

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
    hidden: typeof o.hidden === "boolean" ? o.hidden : undefined,
    available: typeof o.available === "boolean" ? o.available : undefined,
    autoManage: typeof o.autoManage === "boolean" ? o.autoManage : undefined,
    code: typeof o.code === "string" || o.code === null ? (o.code as string | null) : undefined,
    sku: typeof o.sku === "string" || o.sku === null ? (o.sku as string | null) : undefined,
    alternateName:
      typeof o.alternateName === "string" || o.alternateName === null
        ? (o.alternateName as string | null)
        : undefined,
    cost,
    unitName:
      typeof o.unitName === "string" || o.unitName === null
        ? (o.unitName as string | null)
        : undefined,
    colorCode:
      typeof o.colorCode === "string" || o.colorCode === null
        ? (o.colorCode as string | null)
        : undefined,
    modifiedTime: typeof o.modifiedTime === "number" ? o.modifiedTime : undefined,
    categories,
    itemStock:
      o.itemStock && typeof o.itemStock === "object"
        ? (o.itemStock as CloverItemStock)
        : undefined,
  };
}

export function normalizeCloverCategory(raw: unknown): CloverCategory {
  if (!raw || typeof raw !== "object") throw new Error("Invalid Clover category payload");
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const name = typeof o.name === "string" ? o.name : "";
  if (!id || !name) throw new Error("Clover category missing id or name");
  return {
    id,
    name,
    sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : undefined,
    modifiedTime: typeof o.modifiedTime === "number" ? o.modifiedTime : undefined,
  };
}

/** Primary category name from an expanded item (first element), if any. */
export function primaryCategoryName(item: CloverItem): string | null {
  const name = item.categories?.elements?.[0]?.name;
  return name && name.trim() ? name.trim() : null;
}
