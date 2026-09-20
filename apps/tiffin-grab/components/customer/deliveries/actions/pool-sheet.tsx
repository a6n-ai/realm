"use client";
import { Notice, Sheet } from "@/components/customer/kit";
import type { ActionSheetProps } from "./types";

export function PoolSheet({ trip, open, onDone }: ActionSheetProps) {
  return (
    <Sheet open={open} onClose={onDone} title="In your pool">
      <Notice>Coming next: schedule this trip from the pool (trip {trip.date}).</Notice>
    </Sheet>
  );
}
