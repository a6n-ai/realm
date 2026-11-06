"use client";

import { useEffect, useRef, useState } from "react";

export const PHONE_QUERY = "(max-width: 767px)";

type Clip = { src: string; poster: string };
const webp = (jpg: string) => jpg.replace(/\.jpe?g$/, ".webp");

/** Full-bleed muted loop behind the hero. The poster is a real <picture> (the LCP element,
 *  phone or desktop crop by media query); the video gets its src only after hydration, so it
 *  never competes with first paint, and a phone loads the small portrait encode (~430 KB)
 *  instead of the 1.6 MB landscape one. Reduced motion keeps the poster; off-screen pauses. */
export function HeroVideo({ desktop, phone }: { desktop: Clip; phone: Clip }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    v.src = window.matchMedia(PHONE_QUERY).matches ? phone.src : desktop.src;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) void v.play().catch(() => {}); else v.pause(); });
    io.observe(v);
    return () => { io.disconnect(); v.pause(); v.removeAttribute("src"); v.load(); };
  }, [desktop.src, phone.src]);

  return (
    <>
      {/* WebP first (17% lighter), JPEG fallback; sized so the browser reserves the box before it loads. */}
      <picture>
        <source media={PHONE_QUERY} type="image/webp" srcSet={webp(phone.poster)} width={480} height={854} />
        <source media={PHONE_QUERY} srcSet={phone.poster} width={480} height={854} />
        <source type="image/webp" srcSet={webp(desktop.poster)} width={1280} height={720} />
        <img className="lp-hero__video" src={desktop.poster} alt="" width={1280} height={720} fetchPriority="high" />
      </picture>
      <video
        ref={ref}
        className="lp-hero__video"
        data-playing={playing || undefined}
        onPlaying={() => setPlaying(true)}
        muted loop playsInline preload="none" aria-hidden tabIndex={-1}
      />
    </>
  );
}
