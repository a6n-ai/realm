"use client";

import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { transitions } from "@/lib/motion/tokens";

interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  className?: string;
}

export function AnimatedNumber({ value, format = (n) => String(Math.round(n)), className }: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const [animated, setAnimated] = useState(value);
  // With reduced motion there is no animation to read from, so show the value itself
  // rather than pushing it into state from the effect.
  const display = reduce ? value : animated;
  const setDisplay = setAnimated;

  useEffect(() => {
    if (reduce) return;
    const controls = animate(display, value, {
      ...transitions.easeSlow,
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
    // display intentionally excluded — we animate FROM the current display each
    // time the target value changes, not on every intermediate frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);

  return <span className={`tabular-nums ${className ?? ""}`}>{format(display)}</span>;
}
