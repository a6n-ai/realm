"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  CART_MAX_LINES,
  CART_MAX_QTY,
  CART_STORAGE_KEY,
  cartCount,
  cartSubtotal,
  type CartAddInput,
  type CartItem,
} from "@/lib/cart/types";

type CartContextValue = {
  items: CartItem[];
  hydrated: boolean;
  count: number;
  subtotal: number;
  drawerOpen: boolean;
  badgePulse: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  addItem: (input: CartAddInput) => void;
  setQty: (productPublicId: string, quantity: number) => void;
  removeItem: (productPublicId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function clampQty(n: number) {
  return Math.max(0, Math.min(CART_MAX_QTY, Math.floor(n)));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [badgePulse, setBadgePulse] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        if (Array.isArray(parsed)) {
          setItems(
            parsed
              .filter((i) => i?.productPublicId && i.quantity > 0)
              .slice(0, CART_MAX_LINES)
              .map((i) => ({
                productPublicId: String(i.productPublicId),
                name: String(i.name ?? "Item"),
                price: Number(i.price) || 0,
                category: String(i.category ?? ""),
                quantity: clampQty(Number(i.quantity) || 1),
              })),
          );
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* quota / private mode */
    }
  }, [items, hydrated]);

  useEffect(() => {
    if (!badgePulse) return;
    const t = window.setTimeout(() => setBadgePulse(false), 420);
    return () => window.clearTimeout(t);
  }, [badgePulse]);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const addItem = useCallback((input: CartAddInput) => {
    const addQty = clampQty(input.quantity ?? 1) || 1;
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.productPublicId === input.productPublicId);
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
        },
      ];
    });
    setBadgePulse(true);
    setDrawerOpen(true);
  }, []);

  const setQty = useCallback((productPublicId: string, quantity: number) => {
    const q = clampQty(quantity);
    setItems((prev) => {
      if (q <= 0) return prev.filter((i) => i.productPublicId !== productPublicId);
      return prev.map((i) => (i.productPublicId === productPublicId ? { ...i, quantity: q } : i));
    });
  }, []);

  const removeItem = useCallback((productPublicId: string) => {
    setItems((prev) => prev.filter((i) => i.productPublicId !== productPublicId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      hydrated,
      count: cartCount(items),
      subtotal: cartSubtotal(items),
      drawerOpen,
      badgePulse,
      openDrawer,
      closeDrawer,
      addItem,
      setQty,
      removeItem,
      clear,
    }),
    [
      items,
      hydrated,
      drawerOpen,
      badgePulse,
      openDrawer,
      closeDrawer,
      addItem,
      setQty,
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
