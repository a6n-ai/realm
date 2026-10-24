"use client";

import type { ReactNode } from "react";
import { LazyMotion } from "motion/react";

// The animation engine loads after first paint instead of shipping in every page's
// initial JS; `m.*` elements hold their `initial` style until it arrives.
const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={loadFeatures}>{children}</LazyMotion>;
}
