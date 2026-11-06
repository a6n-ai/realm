"use client";

import { useEffect } from "react";

// iOS Safari colours the strip behind its status bar and its bottom toolbar from whatever touches
// the screen edges (fixed elements first, then the page background). The page background is cream,
// so a green hero or the orange footer showed a cream bar above or below. Two fixed hairlines sit on
// those edges and take the colour of the section under them, updated as the page scrolls.
const SKIP = ".tg-bar, .tg-pill, .tg-wa, .tg-edge, .tg-consent";

function colourAt(y: number): string | null {
  for (const el of document.elementsFromPoint(innerWidth / 2, y)) {
    if (el.closest(SKIP)) continue;
    for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== "transparent" && !bg.endsWith(", 0)")) return bg;
    }
  }
  return null;
}

export function EdgeTint() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const top = colourAt(1), bottom = colourAt(innerHeight - 1);
      if (top) root.style.setProperty("--edge-top", top);
      if (bottom) root.style.setProperty("--edge-bottom", bottom);
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(paint); };
    // The first paint can land before layout settles (page transition, restored scroll): repaint on load.
    paint();
    const late = setTimeout(queue, 600);
    addEventListener("load", queue, { once: true });
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(late);
      removeEventListener("scroll", queue);
      removeEventListener("resize", queue);
      root.style.removeProperty("--edge-top");
      root.style.removeProperty("--edge-bottom");
    };
  }, []);
  return (
    <>
      <div className="tg-edge tg-edge--top" aria-hidden />
      <div className="tg-edge tg-edge--bottom" aria-hidden />
    </>
  );
}
