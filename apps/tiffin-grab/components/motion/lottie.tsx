"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";
import type { LottieHandle } from "lottie-react";

// lottie-react pulls in lottie-web (~250kb). Load it only on the client, only
// when a <Lottie> actually mounts, so it never touches SSR or the initial JS.
const LottiePlayer = dynamic(() => import("lottie-react").then((m) => m.LottieSvg), { ssr: false });

export type LottieMode = "loop" | "once" | "hover" | "inView";

interface LottieProps {
  src: string;
  mode?: LottieMode;
  className?: string;
  speed?: number;
  label?: string;
}

export function Lottie({ src, mode = "inView", className, speed = 1, label }: LottieProps) {
  const reduce = useReducedMotion();
  const ref = useRef<LottieHandle>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<object | null>(null);
  const [inView, setInView] = useState(mode !== "inView");

  useEffect(() => {
    let alive = true;
    fetch(src).then((r) => r.json()).then((j) => { if (alive) setData(j); });
    return () => { alive = false; };
  }, [src]);

  useEffect(() => {
    if (mode !== "inView" || !hostRef.current) return;
    const el = hostRef.current;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setInView(true), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [mode]);

  const loop = mode === "loop";
  // Reduced motion, or not-yet-in-view: mount stopped at frame 0.
  const autoplay = !reduce && inView && mode !== "hover";

  const a11y = label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true };

  return (
    <div
      ref={hostRef}
      className={className}
      {...a11y}
      onMouseEnter={mode === "hover" && !reduce ? () => ref.current?.play() : undefined}
      onMouseLeave={mode === "hover" ? () => ref.current?.stop() : undefined}
    >
      {data ? (
        // autoplay is load-time in lottie-react 3; remount when it flips on scroll-in.
        <LottiePlayer
          key={String(autoplay)}
          lottieRef={ref}
          src={data}
          autoplay={autoplay}
          loop={loop}
          speed={speed}
        />
      ) : null}
    </div>
  );
}
