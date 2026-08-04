"use client";

import { useState } from "react";
import { Btn } from "@/components/brutal/shared";
import { useCart } from "@/components/cart/cart-provider";
import { ModifierSheet } from "@/components/order/modifier-sheet";
import type { CartAddInput } from "@/lib/cart/types";
import type { PublicModifierGroup } from "@/lib/orders/modifier-types";

export function AddToCartButton({
  item,
  groups = [],
  block = false,
  size = "sm",
}: {
  item: CartAddInput;
  /** With groups, adding opens the picker — the server rejects an unmade required choice. */
  groups?: PublicModifierGroup[];
  block?: boolean;
  size?: "sm" | "lg";
}) {
  const { addItem } = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const [picking, setPicking] = useState(false);

  const needsChoice = groups.length > 0;

  return (
    <>
      <Btn
        variant={justAdded ? "yellow" : "green"}
        size={size}
        block={block}
        aria-label={
          needsChoice
            ? `Choose options for ${item.name}`
            : justAdded
              ? `Added ${item.name}`
              : `Add ${item.name} to cart`
        }
        onClick={() => {
          if (needsChoice) {
            setPicking(true);
            return;
          }
          addItem(item);
          setJustAdded(true);
          window.setTimeout(() => setJustAdded(false), 900);
        }}
        style={{ minHeight: 44 }}
      >
        {needsChoice ? "Choose options" : justAdded ? "Added ✓" : "Add to cart"}
      </Btn>
      {/* Mounted only while open so each visit starts from a clean selection. */}
      {picking ? (
        <ModifierSheet item={item} groups={groups} onClose={() => setPicking(false)} />
      ) : null}
    </>
  );
}
