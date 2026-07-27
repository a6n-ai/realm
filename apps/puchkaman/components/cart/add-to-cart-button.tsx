"use client";

import { useState } from "react";
import { Btn } from "@/components/brutal/shared";
import { useCart } from "@/components/cart/cart-provider";
import type { CartAddInput } from "@/lib/cart/types";

export function AddToCartButton({
  item,
  block = false,
  size = "sm",
}: {
  item: CartAddInput;
  block?: boolean;
  size?: "sm" | "lg";
}) {
  const { addItem } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  return (
    <Btn
      variant={justAdded ? "yellow" : "red"}
      size={size}
      block={block}
      aria-label={justAdded ? `Added ${item.name}` : `Add ${item.name} to cart`}
      onClick={() => {
        addItem(item);
        setJustAdded(true);
        window.setTimeout(() => setJustAdded(false), 900);
      }}
      style={{ minHeight: 44 }}
    >
      {justAdded ? "Added ✓" : "Add to cart"}
    </Btn>
  );
}
