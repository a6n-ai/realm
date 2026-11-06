"use client";

import { useEffect } from "react";

// iOS Safari colours the strip behind its status bar and its bottom toolbar from whatever touches
// the screen edges (fixed elements first, then the page background). The page background is cream,
// so a green hero or the orange footer showed a cream bar above or below. Two fixed hairlines sit on
// those edges and take the colour of the section under them, updated as the page scrolls.
const SKIP = ".tg-bar, .tg-pill, .tg-wa, .tg-edge, .tg-consent";

// A band painted only with gradients has a transparent background-color: take its base layer's colour
// (the last gradient), its first stop for the top edge and its last stop for the bottom edge.
function gradientColour(image: string, edge: "top" | "bottom"): string | null {
  if (!image || image === "none") return null;
  const base = image.slice(Math.max(image.lastIndexOf("linear-gradient("), image.lastIndexOf("radial-gradient(")));
  const stops = (base.match(/rgba?\([^)]+\)/g) ?? []).filter((c) => !/,\s*0\)$/.test(c));
  return (edge === "top" ? stops[0] : stops.at(-1)) ?? null;
}

function isDark(rgb: string): boolean {
  const [r = 255, g = 255, b = 255] = (rgb.match(/[\d.]+/g) ?? []).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

function colourAt(y: number): string | null {
  for (const el of document.elementsFromPoint(innerWidth / 2, y)) {
    if (el.closest(SKIP)) continue;
    // Only a full-width band counts: a card or phone mockup in the middle must not colour the whole edge.
    for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
      if (n.getBoundingClientRect().width < innerWidth * 0.9) continue;
      const cs = getComputedStyle(n);
      const bg = cs.backgroundColor;
      if (bg && bg !== "transparent" && !bg.endsWith(", 0)")) return bg;
      const g = gradientColour(cs.backgroundImage, y < innerHeight / 2 ? "top" : "bottom");
      if (g) return g;
    }
  }
  return null;
}

export function EdgeTint() {
  useEffect(() => {
    const root = document.documentElement;
    let last = 0;
    let trail: ReturnType<typeof setTimeout> | undefined;
    const paint = () => {
      const top = colourAt(1), bottom = colourAt(innerHeight - 1);
      if (top) root.style.setProperty("--edge-top", top);
      if (bottom) {
        root.style.setProperty("--edge-bottom", bottom);
        // The dock reads this to switch to cream labels over a dark band.
        root.dataset.edgeBottom = isDark(bottom) ? "dark" : "light";
      }
    };
    // Throttled by time, plus one trailing paint where scrolling stops. (A requestAnimationFrame gate
    // could stay stuck if a frame was asked for while the tab was in the background.)
    const queue = () => {
      clearTimeout(trail);
      const now = performance.now();
      if (now - last > 120) { last = now; paint(); }
      trail = setTimeout(paint, 160);
    };
    // The first paint can land before layout settles (page transition, restored scroll): repaint on load.
    paint();
    const late = setTimeout(queue, 600);
    addEventListener("load", queue, { once: true });
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue);
    return () => {
      clearTimeout(trail);
      clearTimeout(late);
      removeEventListener("scroll", queue);
      removeEventListener("resize", queue);
      root.style.removeProperty("--edge-top");
      root.style.removeProperty("--edge-bottom");
      delete root.dataset.edgeBottom;
    };
  }, []);
  return (
    <>
      <div className="tg-edge tg-edge--top" aria-hidden />
      <div className="tg-edge tg-edge--bottom" aria-hidden />
    </>
  );
}
