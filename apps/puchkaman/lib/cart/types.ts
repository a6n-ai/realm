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

export function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export function cartCount(items: CartItem[]) {
  return items.reduce((n, i) => n + i.quantity, 0);
}

export function cartSubtotal(items: CartItem[]) {
  return Math.round(items.reduce((s, i) => s + cartUnitPrice(i) * i.quantity, 0) * 100) / 100;
}
