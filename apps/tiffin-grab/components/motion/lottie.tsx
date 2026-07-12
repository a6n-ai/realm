"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";
import type { LottieRefCurrentProps } from "lottie-react";

// lottie-react pulls in lottie-web (~250kb). Load it only on the client, only
// when a <Lottie> actually mounts, so it never touches SSR or the initial JS.
const LottiePlayer = dynamic(() => import("lottie-react"), { ssr: false });

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
  const ref = useRef<LottieRefCurrentProps>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<unknown>(null);
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

  useEffect(() => { ref.current?.setSpeed(speed); }, [speed, data]);

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
        <LottiePlayer
          lottieRef={ref}
          animationData={data}
          autoplay={autoplay}
          loop={loop}
        />
      ) : null}
    </div>
  );
}
