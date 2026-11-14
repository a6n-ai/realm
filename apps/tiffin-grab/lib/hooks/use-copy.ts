"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useCopy(resetMs?: number) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setCopied(false);
  }, []);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return false;
      }
      setCopied(true);
      if (resetMs != null) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), resetMs);
      }
      return true;
    },
    [resetMs],
  );

  return { copied, copy, reset };
}
