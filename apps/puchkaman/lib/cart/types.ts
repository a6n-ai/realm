/** Client cart line — price is a display estimate; server re-prices at checkout. */
export type CartItem = {
  productPublicId: string;
  name: string;
  price: number;
  category: string;
  quantity: number;
};

export type CartAddInput = Omit<CartItem, "quantity"> & { quantity?: number };

export const CART_STORAGE_KEY = "puchkaman.cart.v1";
export const CART_MAX_QTY = 50;
export const CART_MAX_LINES = 40;

export function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export function cartCount(items: CartItem[]) {
  return items.reduce((n, i) => n + i.quantity, 0);
}

export function cartSubtotal(items: CartItem[]) {
  return Math.round(items.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100;
}
