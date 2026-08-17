"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Seconds left before a one-time code may be re-sent, plus the starter.
 *
 * A visible countdown is the honest version of the throttle that already exists
 * server-side (better-auth rate limits the OTP endpoint), so a customer who
 * never got the email is told when to try again instead of hammering a button
 * that silently 429s.
 */
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
