"use client";

import { useEffect, useRef, type CSSProperties } from "react";

// Plain <video autoPlay muted loop> often fails to actually autoplay: React
// doesn't reliably emit `muted` as a literal HTML attribute in the
// server-rendered markup (a long-standing React DOM quirk), so browsers
// evaluate autoplay eligibility against an "unmuted" element before
// hydration ever sets the JS property, and silently block it. Setting
// `.muted` and calling `.play()` imperatively in an effect sidesteps that.
export function HeroVideo({
  src,
  poster,
  className,
  style,
  ariaLabel,
}: {
  src: string;
  poster?: string;
  className?: string;
  style?: CSSProperties;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;

    // The largest moving thing on the site, and it loops forever — exactly the
    // vestibular motion `prefers-reduced-motion` exists to stop. Paused, the
    // poster still carries the shot, so nothing is lost but the movement.
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (motion.matches) {
        video.pause();
        return;
      }
      video.play().catch(() => {
        // Autoplay can still be blocked in some contexts (e.g. low-power mode) —
        // the poster frame covers that case instead of showing a blank box.
      });
    };
    sync();
    motion.addEventListener("change", sync);
    return () => motion.removeEventListener("change", sync);
  }, []);

  return (
    <video
      ref={ref}
      /* No `autoPlay` attribute: it would start the loop before hydration could
         check the motion preference, so a reduced-motion visitor would see the
         movement anyway. Playback is started by the effect above instead. */
      loop
      muted
      playsInline
      preload="auto"
      poster={poster}
      aria-label={ariaLabel}
      className={className}
      style={style}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
