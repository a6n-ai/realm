"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { lockSession } from "@/lib/auth/lock-actions";

const IDLE_MS = 15 * 60 * 1000;
const ACTIVITY = ["mousemove", "keydown", "pointerdown", "scroll", "visibilitychange"];

export function IdleLock({ thresholdMs = IDLE_MS }: { thresholdMs?: number }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        // Navigate to /lock regardless — a transient lockSession failure must
        // not strand the user on the dashboard (worst case: re-lock on arrival).
        try {
          await lockSession();
        } finally {
          router.push("/lock");
        }
      }, thresholdMs);
    };
    for (const e of ACTIVITY) window.addEventListener(e, reset, { passive: true });
    reset();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const e of ACTIVITY) window.removeEventListener(e, reset);
    };
  }, [thresholdMs, router]);

  return null;
}
