"use client";

import { useEffect } from "react";

// Section-level blocks only, never text: headings, ledes and copy are always there. .lp-bento is a
// sideways swipe row on phones, so the row reveals as one: tiles off to the side would never enter the viewport.
const TARGETS = [
  ".lp-bento", ".lp-faq__list details", ".tg-review-glass",
  ".lp-menu__main", ".lp-menu__aside > .ss-fit", ".lp-offers__carousel", ".tg-deliver__panel",
].join(",");

/**
 * Phones: each block fades up once as it enters, then is left alone. The desktop scroll
 * timelines kept ~140 GPU layers alive for the whole visit, which is what made mobile
 * Safari and Chrome kill the tab; a transition only holds a layer while it runs.
 * Blocks already on screen at load are never hidden, so nothing flashes.
 */
export function PhoneReveal() {
  useEffect(() => {
    if (!matchMedia("(max-width: 767px) and (prefers-reduced-motion: no-preference)").matches) return;
    const els = [...document.querySelectorAll<HTMLElement>(TARGETS)].filter((el) => el.getBoundingClientRect().top > innerHeight);
    const io = new IntersectionObserver((entries) => {
      let i = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.style.setProperty("--reveal-i", String(Math.min(i++, 3)));
        el.dataset.in = "";
        io.unobserve(el);
      }
    });
    for (const el of els) { el.dataset.reveal = ""; io.observe(el); }
    return () => io.disconnect();
  }, []);
  return null;
}
