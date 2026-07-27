"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2Icon } from "lucide-react";

/**
 * Full-viewport blocking overlay while a Clover/Uber admin sync is in flight.
 * Renders above dialogs (z-50) so the screen stays clearly "busy".
 */
export function SyncLoadingOverlay({
  open,
  label = "Syncing…",
}: {
  open: boolean;
  label?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 backdrop-blur-sm"
    >
      <div className="bg-card text-card-foreground border-border flex min-w-[12rem] flex-col items-center gap-3 rounded-xl border px-8 py-6 shadow-lg">
        <Loader2Icon className="text-primary size-8 animate-spin" aria-hidden />
        <p className="text-sm font-medium">{label}</p>
      </div>
    </div>,
    document.body,
  );
}
