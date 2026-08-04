"use client";

import { useEffect, useState } from "react";
import { Btn } from "@/components/brutal/shared";
import { useCart } from "@/components/cart/cart-provider";
import { ModifierPicker } from "@/components/order/modifier-picker";
import { money, type CartAddInput } from "@/lib/cart/types";
import {
  defaultSelection,
  modifierExtraPrice,
  selectedModifiersOf,
  unsatisfiedGroups,
  type PublicModifierGroup,
} from "@/lib/orders/modifier-types";

/**
 * Quick-add sheet for a product that has modifier groups.
 *
 * Mounted only while open (the caller uses `key`/conditional render), so the
 * selection resets per open without any effect syncing it.
 */
export function ModifierSheet({
  item,
  groups,
  onClose,
}: {
  item: Omit<CartAddInput, "modifiers">;
  groups: PublicModifierGroup[];
  onClose: () => void;
}) {
  const { addItem } = useCart();
  const [selected, setSelected] = useState<string[]>(() => defaultSelection(groups));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const missing = unsatisfiedGroups(groups, selected);
  const unitPrice = item.price + modifierExtraPrice(groups, selected);

  function add() {
    if (missing.length) return;
    addItem({ ...item, modifiers: selectedModifiersOf(groups, selected) });
    onClose();
  }

  return (
    <div className="mod-sheet-root">
      <button type="button" className="mod-sheet-backdrop" aria-label="Close options" onClick={onClose} />
      <aside className="mod-sheet" role="dialog" aria-modal="true" aria-label={`Options for ${item.name}`}>
        <div className="mod-sheet__head">
          <div style={{ minWidth: 0 }}>
            <p className="kicker" style={{ marginBottom: 4 }}>
              Choose options
            </p>
            <h2 className="display" style={{ fontSize: "1.4rem", margin: 0, lineHeight: 1.15 }}>
              {item.name}
            </h2>
          </div>
          <button type="button" className="mod-sheet__close" onClick={onClose} aria-label="Close options">
            ✕
          </button>
        </div>

        <div className="mod-sheet__body">
          <ModifierPicker
            groups={groups}
            selected={selected}
            onChange={setSelected}
            idPrefix={`sheet-${item.productPublicId}`}
          />
        </div>

        <div className="mod-sheet__foot">
          {missing.length ? (
            <p
              role="status"
              style={{ margin: "0 0 10px", fontWeight: 700, fontSize: "0.85rem" }}
            >
              Still to choose: {missing.map((g) => g.name).join(", ")}
            </p>
          ) : null}
          <Btn variant="green" size="lg" block disabled={missing.length > 0} onClick={add}>
            Add · {money(unitPrice)}
          </Btn>
        </div>
      </aside>
    </div>
  );
}
