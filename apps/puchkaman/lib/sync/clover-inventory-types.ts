import type { CategoryId } from "../menu-categories";

/** Snapshot of a Clover item for match-review UI + full field apply (no secrets). */
export type CloverMatchIncoming = {
  cloverItemId: string;
  name: string;
  price: number;
  category: CategoryId;
  available: boolean;
  sku: string | null;
  code: string | null;
  alternateName: string | null;
  priceType: string | null;
  hidden: boolean;
  cloverAvailable: boolean;
  autoManage: boolean | null;
  /** Dollars. */
  cost: number | null;
  unitName: string | null;
  colorCode: string | null;
  stockQty: number | null;
};

export type CloverAmbiguousMatch = {
  incoming: CloverMatchIncoming;
  candidates: {
    publicId: string;
    name: string;
    price: number;
    category: string;
    active: boolean;
    imageUrl: string | null;
    reason: "name" | "name_price";
  }[];
};

export type CloverPullResult = {
  created: { publicId: string; name: string; cloverItemId: string }[];
  updated: { publicId: string; name: string; cloverItemId: string }[];
  linked: { publicId: string; name: string; cloverItemId: string }[];
  ambiguous: CloverAmbiguousMatch[];
  /** Local rows kept but marked inactive (OOS) — never deleted. */
  markedOutOfStock: { publicId: string; name: string; reason: "clover_missing" | "uber_unlinked" }[];
  unchanged: number;
  skippedHidden: number;
  errors: { item: string; message: string }[];
};

export type CloverPushResult = {
  created: { publicId: string; name: string; cloverItemId: string }[];
  updated: { publicId: string; name: string; cloverItemId: string }[];
  errors: { item: string; message: string }[];
};

export type CloverPushOptions = {
  /**
   * When set, only these publicIds are pushed (including Uber-only if listed).
   * Default: all Clover-linked rows + active non-Uber unlinked (create-on-Clover).
   */
  publicIds?: string[];
};

export type CloverUnlinkedItem = {
  cloverItemId: string;
  name: string;
  price: number;
  category: string | null;
  available: boolean;
  sku: string | null;
};

/** Result of pulling a single linked product by cloverItemId. */
export type CloverPullOneResult = {
  publicId: string;
  name: string;
  cloverItemId: string;
  changed: boolean;
};
