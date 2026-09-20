"use client";

import { useEffect } from "react";
import { cn, FONT, SPRING } from "./cn";

interface ToastProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  duration?: number;
}

export function Toast({ open, onClose, children, duration = 2600 }: ToastProps) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [open, onClose, duration]);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        FONT,
        "pointer-events-none fixed bottom-[calc(96px+env(safe-area-inset-bottom))] left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-full bg-[var(--foreground)] px-[18px] py-3 text-sm font-medium text-[var(--background)] transition-[opacity,transform] duration-[250ms] motion-reduce:transition-none motion-reduce:duration-[1ms]",
        SPRING,
        open ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0",
      )}
    >
      {open ? children : null}
    </div>
  );
}
