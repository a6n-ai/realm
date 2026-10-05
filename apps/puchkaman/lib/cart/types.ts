/** A modifier the customer picked. Price is display-only; the server re-reads it. */
export type CartModifier = {
  cloverModifierId: string;
  name: string;
  price: number;
};

/** Client cart line — price is a display estimate; server re-prices at checkout. */
export type CartItem = {
  productPublicId: string;
  name: string;
  price: number;
  category: string;
  quantity: number;
  modifiers: CartModifier[];
};

export type CartAddInput = Omit<CartItem, "quantity" | "modifiers"> & {
  quantity?: number;
  modifiers?: CartModifier[];
};

/**
 * Identity of a cart line. Two of the same product with different modifiers are
 * different lines, so quantity must never merge across selections.
 */
export function cartLineKey(item: {
  productPublicId: string;
  modifiers: { cloverModifierId: string }[];
}) {
  const mods = item.modifiers
    .map((m) => m.cloverModifierId)
    .sort()
    .join(",");
  return mods ? `${item.productPublicId}|${mods}` : item.productPublicId;
}

/** Unit price including the chosen modifiers. */
export function cartUnitPrice(item: { price: number; modifiers: { price: number }[] }) {
  return item.modifiers.reduce((s, m) => s + m.price, item.price);
}

// v2 adds modifiers. v1 lines are dropped rather than migrated: a saved line for a
// product whose group is `minRequired` has no valid selection and would be rejected
// at checkout, so an empty cart is the honest state.
export const CART_STORAGE_KEY = "puchkaman.cart.v2";
export const CART_MAX_QTY = 50;
export const CART_MAX_LINES = 40;
export const CART_MAX_MODIFIERS = 20;

/** Cookie naming the server-side cart row; httpOnly, so it's the only cart identity page scripts never see. */
export const CART_COOKIE = "pk_cart";

export function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export function cartCount(items: CartItem[]) {
  return items.reduce((n, i) => n + i.quantity, 0);
}

export function cartSubtotal(items: CartItem[]) {
  return Math.round(items.reduce((s, i) => s + cartUnitPrice(i) * i.quantity, 0) * 100) / 100;
}

/** A server-priced bag line, as returned by /api/checkout/quote. */
export type LivePriceLine = {
  productPublicId: string;
  unitPrice: number;
  modifiers: { cloverModifierId: string; price: number }[];
};

/**
 * Overwrite the prices a cart saved when items were added with the server's
 * current ones, so the bag never shows a price from before an admin's Clover
 * pull. Matched by line identity, not position. Returns the same array when
 * nothing changed, so a caller storing it in state does not re-render or loop.
 */
export function applyLivePrices(items: CartItem[], lines: LivePriceLine[]): CartItem[] {
  const byKey = new Map(lines.map((l) => [cartLineKey(l), l]));
  let changed = false;
  const next = items.map((item) => {
    const live = byKey.get(cartLineKey(item));
    if (!live) return item;
    const modPrice = new Map(live.modifiers.map((m) => [m.cloverModifierId, m.price]));
    const modifiers = item.modifiers.map((m) => {
      const p = modPrice.get(m.cloverModifierId);
      return p === undefined || p === m.price ? m : { ...m, price: p };
    });
    const modsChanged = modifiers.some((m, i) => m !== item.modifiers[i]);
    if (live.unitPrice === item.price && !modsChanged) return item;
    changed = true;
    return { ...item, price: live.unitPrice, modifiers };
  });
  return changed ? next : items;
}
