"use client";

import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { cn } from "@foundry/ui/cn";

export function StatusTileButton({
  icon: Icon, text, tile, label, current, disabled, onClick,
}: {
  icon: LucideIcon;
  text: string;
  tile: string;
  label: string;
  current: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={current}
      onClick={onClick}
      className={cn(
        "flex w-20 flex-col items-center gap-1.5 rounded-lg border p-1.5 text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
        current ? "border-primary bg-accent" : "border-transparent hover:bg-muted",
      )}
    >
      <span className={cn("grid size-10 place-items-center rounded-lg", tile)}>
        <Icon className={cn("size-5", text)} aria-hidden />
      </span>
      <span className="text-xs leading-tight">{label}</span>
    </button>
  );
}

export function TonePill({ icon: Icon, pill, label }: { icon: LucideIcon; pill: string; label: string }) {
  return (
    // max-w-full + truncate: a long label (e.g. "Will take in future") ellipsizes inside its column instead of widening it.
    <Badge variant="outline" size="lg" className={cn("max-w-full border-transparent", pill)} title={label}>
      <Icon className="size-3.5" aria-hidden />
      <span className="truncate">{label}</span>
    </Badge>
  );
}
