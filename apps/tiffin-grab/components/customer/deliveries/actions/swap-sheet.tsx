"use client";
import { Notice, Sheet } from "@/components/customer/kit";
import type { ActionSheetProps } from "./types";

export function SwapSheet({ trip, open, onDone }: ActionSheetProps) {
  return (
    <Sheet open={open} onClose={onDone} title="Swap items">
      <Notice>Coming next: per-eating-day category swaps (trip {trip.date}).</Notice>
    </Sheet>
  );
}
