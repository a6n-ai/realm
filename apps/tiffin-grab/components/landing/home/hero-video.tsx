"use client";

import { useEffect, useRef } from "react";

/** Full-bleed muted loop behind the hero. Reduced motion keeps the poster still; the video
 *  also pauses off-screen so it costs nothing once the visitor scrolls past. */
export function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) { v.pause(); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) void v.play().catch(() => {}); else v.pause(); });
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <video ref={ref} className="lp-hero__video" src={src} poster={poster} autoPlay muted loop playsInline preload="metadata" aria-hidden tabIndex={-1} />
  );
}
