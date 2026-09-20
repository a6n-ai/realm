"use client";
import { Notice, Sheet } from "@/components/customer/kit";
import type { ActionSheetProps } from "./types";

export function MakeupSheet({ trip, open, onDone }: ActionSheetProps) {
  return (
    <Sheet open={open} onClose={onDone} title="Schedule a make-up">
      <Notice>Coming next: schedule pooled tiffins (trip {trip.date}).</Notice>
    </Sheet>
  );
}
