"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Plays a CSS entrance once, when the block first scrolls into view. Server HTML and no-JS show the
 *  finished state: `data-anim="ready"` (armed, waiting) is set only here, then `"play"` in view. */
export function PlayOnView({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < innerHeight * 0.8) return; // already on screen: leave it finished
    el.dataset.anim = "ready";
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      el.dataset.anim = "play";
      io.disconnect();
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={className} aria-hidden>{children}</div>;
}
