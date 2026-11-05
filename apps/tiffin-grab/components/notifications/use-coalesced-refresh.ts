"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Collapse a burst of realtime pings into one `router.refresh()` per quiet window. */
export function useCoalescedRefresh(ms = 1000): () => void {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ router, ms });
  latest.current = { router, ms };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Stable identity so channel subscribe effects do not tear down on every render.
  const refresh = useRef<() => void>(null!);
  if (!refresh.current) {
    refresh.current = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        latest.current.router.refresh();
      }, latest.current.ms);
    };
  }
  return refresh.current;
}
