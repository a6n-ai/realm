"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  CART_MAX_LINES,
  CART_MAX_MODIFIERS,
  CART_MAX_QTY,
  CART_STORAGE_KEY,
  cartCount,
  cartLineKey,
  cartSubtotal,
  type CartAddInput,
  type CartItem,
  type CartModifier,
} from "@/lib/cart/types";

type CartContextValue = {
  items: CartItem[];
  hydrated: boolean;
  count: number;
  subtotal: number;
  drawerOpen: boolean;
  badgePulse: boolean;
  /** False until Clover is client-ready for public pickup checkout. */
  orderingEnabled: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  addItem: (input: CartAddInput) => void;
  /** Both take a `cartLineKey`, not a product id — one product can span several lines. */
  setQty: (lineKey: string, quantity: number) => void;
  /** Delta-based, reading current quantity from state at apply time — safe under rapid taps. */
  incrementQty: (lineKey: string) => void;
  decrementQty: (lineKey: string) => void;
  removeItem: (lineKey: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function clampQty(n: number) {
  return Math.max(0, Math.min(CART_MAX_QTY, Math.floor(n)));
}

/** Stable empty reference so the pre-hydration value never re-triggers memos. */
const NO_ITEMS: CartItem[] = [];

const noopSubscribe = () => () => {};

function readStoredModifiers(raw: unknown): CartModifier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m === "object" && typeof m.cloverModifierId === "string")
    .slice(0, CART_MAX_MODIFIERS)
    .map((m) => ({
      cloverModifierId: String(m.cloverModifierId),
      name: String(m.name ?? ""),
      price: Number(m.price) || 0,
    }));
}

/** Read the saved cart. Returns empty on the server, on corrupt JSON, or in private mode. */
function readStoredCart(): CartItem[] {
  if (typeof window === "undefined") return NO_ITEMS;
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return NO_ITEMS;
    const parsed = JSON.parse(raw) as CartItem[];
    if (!Array.isArray(parsed)) return NO_ITEMS;
    return parsed
      .filter((i) => i?.productPublicId && i.quantity > 0)
      .slice(0, CART_MAX_LINES)
      .map((i) => ({
        productPublicId: String(i.productPublicId),
        name: String(i.name ?? "Item"),
        price: Number(i.price) || 0,
        category: String(i.category ?? ""),
        quantity: clampQty(Number(i.quantity) || 1),
        modifiers: readStoredModifiers(i.modifiers),
      }));
  } catch {
    return NO_ITEMS;
  }
}

export function CartProvider({
  children,
  orderingEnabled = true,
}: {
  children: ReactNode;
  orderingEnabled?: boolean;
}) {
  // Storage is read once during the lazy initialiser rather than in an effect.
  const [items, setItems] = useState<CartItem[]>(readStoredCart);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // A counter, not a boolean: adding twice inside the pulse window has to restart
  // the window, and a stuck-true flag would leave the second add with no feedback
  // at all (the same trap `AddToCartButton` solves for its label).
  const [pulse, setPulse] = useState(0);

  // False on the server AND on the hydration pass, true immediately after. Consumers
  // therefore render an empty cart while hydrating — matching the server output — and
  // the saved cart appears on the next commit. Exposing `items` directly would make
  // the badge count differ between server and client and break hydration.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const visibleItems = hydrated ? items : NO_ITEMS;

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* quota / private mode */
    }
  }, [items, hydrated]);

  useEffect(() => {
    if (!pulse) return;
    const t = window.setTimeout(() => setPulse(0), 180);
    return () => window.clearTimeout(t);
  }, [pulse]);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const addItem = useCallback(
    (input: CartAddInput) => {
      if (!orderingEnabled) return;
      const addQty = clampQty(input.quantity ?? 1) || 1;
      setItems((prev) => {
        const modifiers = (input.modifiers ?? []).slice(0, CART_MAX_MODIFIERS);
        // Merge only into a line with the identical modifier set — same burger with
        // and without extra cheese are two different things to order.
        const key = cartLineKey({ productPublicId: input.productPublicId, modifiers });
        const idx = prev.findIndex((i) => cartLineKey(i) === key);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            name: input.name,
            price: input.price,
            category: input.category,
            quantity: clampQty(next[idx].quantity + addQty),
          };
          return next;
        }
        if (prev.length >= CART_MAX_LINES) return prev;
        return [
          ...prev,
          {
            productPublicId: input.productPublicId,
            name: input.name,
            price: input.price,
            category: input.category,
            quantity: addQty,
            modifiers,
          },
        ];
      });
      setPulse((n) => n + 1);
      setDrawerOpen(true);
    },
    [orderingEnabled],
  );

  // Keyed by line, not product: a product can now occupy several lines.
  const setQty = useCallback((lineKey: string, quantity: number) => {
    const q = clampQty(quantity);
    setItems((prev) => {
      if (q <= 0) return prev.filter((i) => cartLineKey(i) !== lineKey);
      return prev.map((i) => (cartLineKey(i) === lineKey ? { ...i, quantity: q } : i));
    });
  }, []);

  // Compute the next quantity from the freshest state inside the updater itself —
  // reading `item.quantity` from a render closure in the caller means rapid taps
  // all see the same stale value and only one net change applies.
  const incrementQty = useCallback((lineKey: string) => {
    setItems((prev) =>
      prev.map((i) => (cartLineKey(i) === lineKey ? { ...i, quantity: clampQty(i.quantity + 1) } : i)),
    );
  }, []);

  const decrementQty = useCallback((lineKey: string) => {
    setItems((prev) => {
      const next = prev
        .map((i) => (cartLineKey(i) === lineKey ? { ...i, quantity: clampQty(i.quantity - 1) } : i))
        .filter((i) => i.quantity > 0);
      return next;
    });
  }, []);

  const removeItem = useCallback((lineKey: string) => {
    setItems((prev) => prev.filter((i) => cartLineKey(i) !== lineKey));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      items: visibleItems,
      hydrated,
      count: cartCount(visibleItems),
      subtotal: cartSubtotal(visibleItems),
      drawerOpen,
      badgePulse: pulse > 0,
      orderingEnabled,
      openDrawer,
      closeDrawer,
      addItem,
      setQty,
      incrementQty,
      decrementQty,
      removeItem,
      clear,
    }),
    [
      visibleItems,
      hydrated,
      drawerOpen,
      pulse,
      orderingEnabled,
      openDrawer,
      closeDrawer,
      addItem,
      setQty,
      incrementQty,
      decrementQty,
      removeItem,
      clear,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
