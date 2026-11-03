"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A glass panel that leans toward a fine pointer, like a physical sheet catching light.
 *  The angle eases toward its target every frame from the current value (never a CSS
 *  transition), so moving the pointer mid-motion just redirects it. It also feeds --mx/--my
 *  so the .lp-bevel sheen follows the pointer. Touch screens and reduced motion: still. */
export function Tilt({ children, className, max = 4 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let x = 0, y = 0, tx = 0, ty = 0, frame = 0;
    const tick = () => {
      // Close a fixed share of the gap each frame: a critically damped settle, no overshoot.
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      el.style.transform = `perspective(1200px) rotateX(${y.toFixed(3)}deg) rotateY(${x.toFixed(3)}deg)`;
      frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.01 ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => { if (!frame) frame = requestAnimationFrame(tick); };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      tx = (px - 0.5) * 2 * max;
      ty = (0.5 - py) * 2 * max;
      el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      kick();
    };
    const onLeave = () => { tx = 0; ty = 0; kick(); };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
      el.style.transform = "";
    };
  }, [max]);

  return <div ref={ref} className={className ? `lp-tilt ${className}` : "lp-tilt"}>{children}</div>;
}
