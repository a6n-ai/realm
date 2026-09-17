/**
 * Which storefront a cart was filled at.
 *
 * Each franchise sells its own Clover-synced products (disjoint ids, different
 * prices) and checkout re-prices strictly against the acting franchise, so a
 * line from the other store fails with "Product not available". A cart carried
 * silently across a location switch therefore looks fine right up until the
 * customer pays. The cart records the store it was built for, and a mismatch is
 * put to the customer instead of being kept quietly or wiped without asking.
 */
export type CartFranchise = {
  clientCode: string;
  /** Customer-facing store name; null for the brand default, i.e. no location chosen yet. */
  label: string | null;
};

export const CART_FRANCHISE_STORAGE_KEY = "puchkaman.cart.franchise";

export type FranchiseReconciliation =
  | { kind: "in-sync" }
  | { kind: "adopt"; franchise: CartFranchise }
  | { kind: "conflict"; from: CartFranchise; to: CartFranchise };

export function reconcileCartFranchise({
  stored,
  active,
  itemCount,
}: {
  stored: CartFranchise | null;
  active: CartFranchise | null;
  itemCount: number;
}): FranchiseReconciliation {
  // The server resolved no store at all, so there is nothing trustworthy to compare against.
  if (!active) return { kind: "in-sync" };
  const sameStore = stored?.clientCode === active.clientCode;
  if (sameStore && stored?.label === active.label) return { kind: "in-sync" };
  // An empty cart belongs to wherever the customer is now; the same store under a new label just refreshes it.
  if (itemCount === 0 || sameStore) return { kind: "adopt", franchise: active };
  // Items saved before carts were tagged: their store is unknowable, and blocking every
  // returning customer on a guess is worse than letting checkout re-price as it does today.
  if (!stored) return { kind: "adopt", franchise: active };
  return { kind: "conflict", from: stored, to: active };
}

/** Read the saved tag. Anything malformed reads as untagged rather than throwing. */
export function parseStoredCartFranchise(raw: string | null): CartFranchise | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    const { clientCode, label } = value as Record<string, unknown>;
    if (typeof clientCode !== "string" || !clientCode) return null;
    return { clientCode, label: typeof label === "string" && label ? label : null };
  } catch {
    return null;
  }
}
