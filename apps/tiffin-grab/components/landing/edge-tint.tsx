"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Reads the colour of the section under the screen edges as the page scrolls:
// - the html background follows the top edge, so overscroll and the strip behind Safari's status
//   bar match a green hero instead of showing cream;
// - data-edge-bottom tells the dock whether it sits over a dark band (cream labels) or a light one.
// No elements are drawn: fixed 1px edge lines showed as thin bars once Safari (iOS 26) started
// drawing the page under its own bars.
const SKIP = ".tg-bar, .tg-pill, .tg-consent";

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

function colourAt(y: number, minWidth = 0.9): string | null {
  for (const el of document.elementsFromPoint(innerWidth / 2, y)) {
    if (el.closest(SKIP)) continue;
    // Only a full-width band counts: a card or phone mockup in the middle must not colour the whole edge.
    for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
      if (n.getBoundingClientRect().width < innerWidth * minWidth) continue;
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
  // A link to another page swaps the content without a scroll: repaint on every route.
  const path = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    let last = 0;
    let trail: ReturnType<typeof setTimeout> | undefined;
    const paint = () => {
      const top = colourAt(1, 0.97), bottom = colourAt(innerHeight - 1, 0.97);
      // Safari paints the html background in the top status-bar strip and in the bottom overscroll: near the
      // end of the page the bottom one is what shows (the footer), so follow that edge there.
      const nearEnd = scrollY + innerHeight > root.scrollHeight - innerHeight * 0.5;
      const edge = nearEnd ? bottom ?? top : top;
      if (edge) root.style.backgroundColor = edge;
      // The dock's label colour follows what sits right behind it (a boxed green panel counts, a
      // small card does not), so it reads cream over green and dark over cream.
      const behind = colourAt(innerHeight - 40, 0.3) ?? bottom;
      if (behind) root.dataset.edgeBottom = isDark(behind) ? "dark" : "light";
      // The fade under the dock takes the same colour, so text dissolves into its band before the glass.
      if (behind) root.style.setProperty("--edge-behind", behind);
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
      root.style.removeProperty("background-color");
      root.style.removeProperty("--edge-behind");
      delete root.dataset.edgeBottom;
    };
  }, [path]);
  return null;
}
