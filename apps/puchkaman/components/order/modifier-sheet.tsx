"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Btn } from "@/components/brutal/shared";
import { useCart } from "@/components/cart/cart-provider";
import { useModalFocus } from "@/lib/a11y/use-modal-focus";
import { useDragDismiss } from "@/lib/motion/use-drag-dismiss";
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
  // Only the phone layout is a bottom sheet with an edge to leave by. From 720px
  // up it is a centred dialog anchored to nothing, so there is no direction a
  // drag could mean.
  const [isSheet, setIsSheet] = useState(false);
  const sheet = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setClosing(true), []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 719px)");
    const sync = () => setIsSheet(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Drag down to dismiss, by the sheet's chrome only — the body between them
  // scrolls, and a y-drag starting there belongs to the scroller.
  const grab = useDragDismiss(sheet, { axis: "y", enabled: isSheet && !closing, onDismiss: close });
  // Held through the exit as well: dropping the trap the moment closing starts
  // would strand the keyboard on a surface that is still on screen.
  useModalFocus(sheet, true);

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
        ref={sheet}
        className="mod-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Options for ${item.name}`}
        data-closing={closing || undefined}
      >
        <div className="mod-sheet__head" {...grab}>
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

        <div className="mod-sheet__foot" {...grab}>
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
