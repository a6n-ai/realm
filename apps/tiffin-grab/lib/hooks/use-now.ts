"use client";

import { useEffect, useState } from "react";

/** Epoch ms refreshed every `intervalMs`. Null until mounted, so server and browser clocks never mismatch on hydration. */
export function useNow(intervalMs: number): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
