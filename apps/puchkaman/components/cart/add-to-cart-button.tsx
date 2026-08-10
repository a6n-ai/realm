"use client";

import { useEffect, useState } from "react";
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
  // A counter, not a boolean: adding the same item twice in a row bumps it, so
  // the effect below re-runs and the "Added" window restarts from the last tap
  // instead of expiring on the first one's clock.
  const [added, setAdded] = useState(0);
  const [picking, setPicking] = useState(false);
  const justAdded = added > 0;

  useEffect(() => {
    if (!added) return;
    const t = window.setTimeout(() => setAdded(0), 900);
    return () => window.clearTimeout(t);
  }, [added]);

  const needsChoice = groups.length > 0;
  const label = needsChoice ? "Choose options" : justAdded ? "Added ✓" : "Add to cart";

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
          setAdded((n) => n + 1);
        }}
        style={{ minHeight: 44 }}
      >
        {/* Keyed so each swap remounts and replays the blur. Without it you see
            two distinct strings crossing; a brief blur reads as one label
            becoming another. */}
        <span className="label-swap" key={`${label}-${added}`}>
          {label}
        </span>
      </Btn>
      {/* Mounted only while open so each visit starts from a clean selection. */}
      {picking ? (
        <ModifierSheet item={item} groups={groups} onClose={() => setPicking(false)} />
      ) : null}
    </>
  );
}
