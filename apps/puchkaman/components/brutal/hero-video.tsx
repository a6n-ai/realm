"use client";

import { useEffect, useRef, type CSSProperties } from "react";

// Plain <video autoPlay muted loop> often fails to actually autoplay: React
// doesn't reliably emit `muted` as a literal HTML attribute in the
// server-rendered markup (a long-standing React DOM quirk), so browsers
// evaluate autoplay eligibility against an "unmuted" element before
// hydration ever sets the JS property, and silently block it. Setting
// `.muted` and calling `.play()` imperatively in an effect sidesteps that.
export function HeroVideo({ src, className, style, ariaLabel }: { src: string; className?: string; style?: CSSProperties; ariaLabel: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    video.play().catch(() => {
      // Autoplay can still be blocked in some contexts (e.g. low-power mode) —
      // the video just sits on its poster frame rather than erroring.
    });
  }, []);

  return (
    <video ref={ref} autoPlay loop muted playsInline aria-label={ariaLabel} className={className} style={style}>
      <source src={src} type="video/mp4" />
    </video>
  );
}
