"use client";

import { useEffect } from "react";

/* Gate the pop-in / drop-in entrances: `.anim`/`.hero-art` only animate under
   `.anim-ready` (set after mount), so SSR paints them in their final state. */
export function AnimReady() {
  useEffect(() => {
    document.documentElement.classList.add("anim-ready");
    return () => document.documentElement.classList.remove("anim-ready");
  }, []);
  return null;
}
