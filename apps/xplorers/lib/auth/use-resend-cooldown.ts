"use client";

import { useEffect, useRef, useState } from "react";

export function useResendCooldown(seconds = 30): [number, () => void] {
  const [left, setLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function start() {
    setLeft(seconds);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setLeft((v) => {
        if (v <= 1 && timer.current) clearInterval(timer.current);
        return v - 1 <= 0 ? 0 : v - 1;
      });
    }, 1000);
  }

  return [left, start];
}
