"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

/** Matches the `[data-closing]` transition in globals.css. */
const EXIT_MS = 180;

/**
 * Quick-add sheet for a product that has modifier groups.
 *
 * Mounted only while open (the caller uses `key`/conditional render), so the
 * selection resets per open without any effect syncing it. Closing runs through
 * `close()` rather than `onClose()` directly: it marks the sheet `[data-closing]`
 * and holds the unmount for the length of the exit, so the sheet leaves by the
 * edge it entered instead of blinking out of existence.
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
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => setClosing(true), []);

  useEffect(() => {
    if (!closing) return;
    // No exit to wait for when the transition is off, so unmount on the spot.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(onClose, reduced ? 0 : EXIT_MS);
    return () => window.clearTimeout(t);
  }, [closing, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  const missing = unsatisfiedGroups(groups, selected);
  const unitPrice = item.price + modifierExtraPrice(groups, selected);

  function add() {
    if (missing.length) return;
    addItem({ ...item, modifiers: selectedModifiersOf(groups, selected) });
    close();
  }

  // Portalled to <body>. The menu cards carry a hover-lift `transform`, and a
  // transformed ancestor becomes the containing block for `position: fixed` — so
  // rendered in place the sheet lays itself out against the card instead of the
  // viewport, clipped and shifting every time the hover transform toggles.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="mod-sheet-root">
      <button
        type="button"
        className="mod-sheet-backdrop"
        aria-label="Close options"
        onClick={close}
        data-closing={closing || undefined}
      />
      <aside
        className="mod-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Options for ${item.name}`}
        data-closing={closing || undefined}
      >
        <div className="mod-sheet__head">
          <div style={{ minWidth: 0 }}>
            <p className="kicker" style={{ marginBottom: 4 }}>
              Choose options
            </p>
            <h2 className="display" style={{ fontSize: "1.4rem", margin: 0, lineHeight: 1.15 }}>
              {item.name}
            </h2>
          </div>
          <button type="button" className="mod-sheet__close" onClick={close} aria-label="Close options">
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
    </div>,
    document.body,
  );
}
