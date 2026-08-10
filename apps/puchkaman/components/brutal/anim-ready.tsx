"use client";

import { useEffect } from "react";

/* Gate for `.reveal`: its hidden state only exists under `.anim-ready` (set
   after mount), so a visitor whose JS never runs — and therefore whose
   IntersectionObserver never clears it — still sees the page, not a blank
   column. The hero entrances no longer need this; they use @starting-style. */
export function AnimReady() {
  useEffect(() => {
    document.documentElement.classList.add("anim-ready");
    return () => document.documentElement.classList.remove("anim-ready");
  }, []);
  return null;
}
