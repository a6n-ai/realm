"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Keyboard containment for the cart drawer and the modifier sheet.
 *
 * Both already announce themselves as `role="dialog" aria-modal="true"` and
 * close on Escape, but neither moved focus: opening one left the keyboard behind
 * on the trigger, and Tab walked straight out into the page underneath — which
 * is exactly what `aria-modal` promises does not happen.
 *
 * Focus goes to the surface itself rather than its first control, so a screen
 * reader announces what just opened before what you can do in it. On close it
 * returns to whatever opened the surface, so the keyboard ends up where the
 * gesture started.
 */
export function useModalFocus(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;

    const restoreTo = document.activeElement as HTMLElement | null;
    // The surface is not naturally focusable; -1 makes it a target without
    // adding it to the tab order.
    if (!root.hasAttribute("tabindex")) root.tabIndex = -1;
    root.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusable(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      // Wrap at both ends, and pull focus back in if it has escaped the surface
      // (a click on the page behind, say).
      if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Only take focus back if it is still inside the surface — if something
      // else has claimed it since, stealing it would be the ruder move.
      if (root.contains(document.activeElement)) restoreTo?.focus({ preventScroll: true });
    };
  }, [active, ref]);
}
