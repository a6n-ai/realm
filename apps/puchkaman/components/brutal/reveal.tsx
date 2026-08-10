"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/* One observer for every Reveal on the page, not one per instance — the
   homepage alone mounts a dozen, and IntersectionObserver is built to watch
   many targets. Created lazily inside the effect so it never runs on the
   server. */
let shared: IntersectionObserver | null = null;
function observer() {
  shared ??= new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        en.target.classList.add("in");
        shared?.unobserve(en.target);
      }
    },
    { threshold: 0.12 },
  );
  return shared;
}

/* Scroll-triggered entrance — adds `.in` when the element enters the viewport.
   The stagger rides on `--d` (read by `.reveal.in`'s transition-delay) rather
   than a setTimeout: CSS delays run off the main thread and there is no timer
   left to fire against an unmounted node. */
export function Reveal({
  children,
  delay = 0,
  className = "",
  style = {},
}: {
  children: ReactNode;
  /** Stagger in milliseconds. */
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = observer();
    io.observe(el);
    return () => io.unobserve(el);
  }, []);
  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={{ ...style, "--d": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
