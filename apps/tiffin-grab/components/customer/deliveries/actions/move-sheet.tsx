"use client";
import { Notice, Sheet } from "@/components/customer/kit";
import type { ActionSheetProps } from "./types";

export function MoveSheet({ trip, open, onDone }: ActionSheetProps) {
  return (
    <Sheet open={open} onClose={onDone} title="Move to another day">
      <Notice>Coming next: reschedule with merge preview (trip {trip.date}).</Notice>
    </Sheet>
  );
}
