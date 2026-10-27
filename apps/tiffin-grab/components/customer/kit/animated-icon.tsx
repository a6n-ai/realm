"use client";

import { useReducedMotion, type TargetAndTransition } from "motion/react";
import * as m from "motion/react-m";
import type { ReactNode } from "react";

export type IconGesture = "pop" | "wiggle" | "spin" | "bounce";

// Multi-keyframe moves need a tween (springs take two keyframes); pop uses a spring. Same set as the
// Copper & Cloves AnimatedIcon, played when the icon becomes active instead of on hover.
const GESTURE: Record<IconGesture, { from: TargetAndTransition; to: TargetAndTransition }> = {
  pop: { from: { scale: 0.55, rotate: -18 }, to: { scale: 1, rotate: 0, transition: { type: "spring", stiffness: 320, damping: 14 } } },
  wiggle: { from: { rotate: 0 }, to: { rotate: [0, -14, 12, -6, 0], transition: { duration: 0.5, ease: "easeInOut" } } },
  spin: { from: { rotate: -180, scale: 0.8 }, to: { rotate: 0, scale: 1, transition: { type: "spring", stiffness: 220, damping: 16 } } },
  bounce: { from: { y: 0 }, to: { y: [0, -5, 0, -2, 0], transition: { duration: 0.45, ease: "easeOut" } } },
};

/**
 * Plays a one-off gesture on its icon each time `active` turns on (a tab being selected), and rests otherwise.
 * Re-keyed on activation so the gesture replays from the start; reduced motion shows the icon still.
 */
export function AnimatedIcon({ active, gesture = "pop", children }: { active: boolean; gesture?: IconGesture; children: ReactNode }) {
  const still = useReducedMotion();
  if (still || !active) return <span className="inline-flex">{children}</span>;
  const g = GESTURE[gesture];
  return (
    <m.span key="on" className="inline-flex" initial={g.from} animate={g.to}>
      {children}
    </m.span>
  );
}
