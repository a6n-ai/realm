"use client";

import type { Handle, Rect } from "./crop-geometry";
import { cn } from "@/lib/utils";

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const POS: Record<Handle, string> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  s: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
  sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
  w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
};

export function CropBox({
  rect,
  round,
  onBoxPointerDown,
  onHandlePointerDown,
}: {
  rect: Rect; // in SCREEN coords relative to the viewport
  round: boolean;
  onBoxPointerDown: (e: React.PointerEvent) => void;
  onHandlePointerDown: (e: React.PointerEvent, handle: Handle) => void;
}) {
  return (
    <div
      className={cn(
        "absolute border border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]",
        round && "rounded-full",
      )}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, touchAction: "none" }}
      onPointerDown={onBoxPointerDown}
    >
      {HANDLES.map((h) => (
        <div
          key={h}
          data-handle={h}
          onPointerDown={(e) => onHandlePointerDown(e, h)}
          className={cn("absolute size-3 rounded-full border border-white bg-primary", POS[h])}
        />
      ))}
    </div>
  );
}
