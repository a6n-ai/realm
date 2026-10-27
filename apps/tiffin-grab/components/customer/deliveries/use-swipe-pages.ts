"use client";
import { useLayoutEffect, useRef, type PointerEvent } from "react";

/** Past the last page there is nothing more: the view resists instead of following the finger 1:1. */
const rubberband = (x: number, width: number) => (x * width * 0.55) / (width + 0.55 * Math.abs(x));
const still = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Finger-swipe paging for a week/month view (pointer events, 10px slop, rubber-band at bounds).
 * `page` is any string that sorts in page order; `step(dir)` must move to the next/previous page.
 * Spread `bind` on the element that holds the pages; give it `[touch-action:pan-y]`.
 * The old page leaves the way the finger went and the new one arrives from the other side; reduced motion swaps instantly.
 */
export function useSwipePages({ page, canPrev, canNext, step }: { page: string; canPrev: boolean; canNext: boolean; step: (dir: 1 | -1) => void }) {
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; t: number; dx: number; horizontal: boolean | null } | null>(null);
  const swiped = useRef(false);
  const leaving = useRef<number | null>(null);
  const shown = useRef(page);
  const offset = (dx: number) => {
    const el = grid.current;
    if (!el) return;
    const blocked = (dx > 0 && !canPrev) || (dx < 0 && !canNext);
    el.style.transform = dx ? `translateX(${blocked ? rubberband(dx, el.offsetWidth) : dx}px)` : "";
  };
  const settle = () => {
    const el = grid.current;
    if (!el) return;
    el.style.transition = "transform 300ms cubic-bezier(0.22,1,0.36,1)";
    offset(0);
    el.addEventListener("transitionend", () => (el.style.transition = ""), { once: true });
  };
  const go = (dir: 1 | -1) => {
    const el = grid.current;
    if (el && !still()) {
      el.style.transition = "transform 180ms cubic-bezier(0.4,0,1,1), opacity 180ms ease-in";
      el.style.transform = `translateX(${-dir * el.offsetWidth * 0.4}px)`;
      el.style.opacity = "0";
      // A page change that never lands (offline, error) must not leave the view hidden.
      const t = window.setTimeout(() => leaving.current === t && (settle(), (el.style.opacity = ""), (leaving.current = null)), 3000);
      leaving.current = t;
    }
    step(dir);
  };
  useLayoutEffect(() => {
    if (page === shown.current) return;
    const dir = page > shown.current ? 1 : -1;
    shown.current = page;
    if (leaving.current) window.clearTimeout(leaving.current);
    leaving.current = null;
    const el = grid.current;
    if (!el || still()) return;
    el.style.transition = "none";
    el.style.transform = `translateX(${dir * el.offsetWidth * 0.4}px)`;
    el.style.opacity = "0";
    void el.offsetWidth;
    el.style.transition = "transform 320ms cubic-bezier(0.22,1,0.36,1), opacity 220ms ease-out";
    el.style.transform = "";
    el.style.opacity = "";
  }, [page]);

  const bind = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") return;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, horizontal: null };
      swiped.current = false;
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      // Decide the direction once, after a 10px slop, then track 1:1.
      if (d.horizontal === null && Math.hypot(dx, dy) > 10) {
        d.horizontal = Math.abs(dx) > Math.abs(dy);
        if (d.horizontal) e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      if (!d.horizontal) return;
      d.dx = dx;
      offset(dx);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      drag.current = null;
      if (!d?.horizontal) return;
      swiped.current = true;
      const flick = Math.abs(d.dx) / Math.max(e.timeStamp - d.t, 1) > 0.5;
      const dir = d.dx < 0 ? 1 : -1;
      if ((Math.abs(d.dx) > 50 || flick) && (dir === 1 ? canNext : canPrev)) go(dir);
      else settle();
    },
    onPointerCancel: () => {
      drag.current = null;
      settle();
    },
    // The tap that ends a swipe must not also pick a day.
    onClickCapture: (e: React.MouseEvent) => {
      if (swiped.current) {
        swiped.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    },
  };
  return { ref: grid, bind, go };
}
