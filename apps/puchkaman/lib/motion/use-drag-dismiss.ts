"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { DRAG_THRESHOLD, dragOffset, shouldDismiss } from "./drag-dismiss";

type Axis = "x" | "y";

type Drag = {
  pointerId: number;
  start: number;
  last: number;
  lastTime: number;
  velocity: number;
  claimed: boolean;
};

/**
 * Drag-to-dismiss for a sheet or drawer.
 *
 * The surface tracks the pointer 1:1 while dragging, so the gesture and the
 * thought happen together instead of the surface waiting for a release and then
 * playing a canned animation. Release either continues into the CSS exit
 * (dismiss) or lets the existing CSS transition carry it home — both start from
 * the transform that is on screen at that instant, which is what makes the
 * gesture interruptible: grab a settling sheet and it follows the finger again
 * from wherever it had got to.
 *
 * Takes the surface's own ref and returns only handlers, to spread onto
 * whatever should be grabbable — which need not be the surface itself: the
 * modifier sheet drags by its chrome so its scrollable body is left alone.
 * (Handing the ref back out instead would make every property read on the
 * result look like a render-time ref access to the React compiler.)
 */
export function useDragDismiss(
  ref: RefObject<HTMLElement | null>,
  {
    axis,
    enabled,
    onDismiss,
  }: {
    axis: Axis;
    enabled: boolean;
    /** Positive-direction release: run the surface's normal close path. */
    onDismiss: () => void;
  },
): {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
} {
  const drag = useRef<Drag | null>(null);

  const point = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => (axis === "x" ? e.clientX : e.clientY),
    [axis],
  );

  const size = useCallback(() => {
    const el = ref.current;
    if (!el) return 0;
    return axis === "x" ? el.offsetWidth : el.offsetHeight;
  }, [axis, ref]);

  const reset = useCallback(() => {
    const el = ref.current;
    if (el) {
      el.style.transform = "";
      delete el.dataset.dragging;
    }
    drag.current = null;
  }, [ref]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      // A second finger mid-drag would otherwise teleport the surface to the new
      // contact point.
      if (!enabled || drag.current || !e.isPrimary || !ref.current) return;
      drag.current = {
        pointerId: e.pointerId,
        start: point(e),
        last: point(e),
        lastTime: e.timeStamp,
        velocity: 0,
        claimed: false,
      };
      // Capture is taken at claim time, not here: capturing on every press
      // retargets the eventual click to the capturing element, which would eat
      // taps on the buttons that live inside the grab area.
    },
    [enabled, point, ref],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const state = drag.current;
      const el = ref.current;
      if (!state || !el || e.pointerId !== state.pointerId) return;

      const now = point(e);
      const raw = now - state.start;
      // Hysteresis: below the threshold this is still a tap, and claiming it
      // early would swallow clicks on buttons inside the grab area.
      if (!state.claimed) {
        if (Math.abs(raw) < DRAG_THRESHOLD) return;
        state.claimed = true;
        el.dataset.dragging = "true";
        // Now that this is definitely a drag, keep receiving moves even when the
        // finger leaves the surface. Capture throws if the pointer is already
        // gone by the time we ask — the drag still works, it just stops at the
        // surface edge, so this is not worth failing the gesture over.
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointer released mid-claim */
        }
      }

      const dt = e.timeStamp - state.lastTime;
      if (dt > 0) state.velocity = (now - state.last) / dt;
      state.last = now;
      state.lastTime = e.timeStamp;

      const offset = dragOffset(raw, size());
      // Written straight onto the element rather than through a CSS variable on
      // a parent: an inherited variable recalculates styles for every child, and
      // these surfaces hold a whole cart.
      el.style.transform = axis === "x" ? `translate3d(${offset}px,0,0)` : `translate3d(0,${offset}px,0)`;
    },
    [axis, point, ref, size],
  );

  const end = useCallback(
    (e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
      const state = drag.current;
      if (!state || e.pointerId !== state.pointerId) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      const raw = point(e) - state.start;
      const dismiss = !cancelled && state.claimed && shouldDismiss(raw, state.velocity, size());
      // Clearing the inline transform and closing in the same commit hands the
      // surface to the CSS exit from where the finger left it. Clearing it in a
      // later frame would snap the sheet home first and then close it.
      reset();
      if (dismiss) onDismiss();
    },
    [onDismiss, point, reset, size],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => end(e, false), [end]);
  const onPointerCancel = useCallback((e: ReactPointerEvent<HTMLElement>) => end(e, true), [end]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
