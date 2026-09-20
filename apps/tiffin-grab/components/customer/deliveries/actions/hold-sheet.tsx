"use client";
import { Notice, Sheet } from "@/components/customer/kit";
import type { ActionSheetProps } from "./types";

export function HoldSheet({ trip, open, onDone }: ActionSheetProps) {
  return (
    <Sheet open={open} onClose={onDone} title="Hold this trip">
      <Notice>Coming next: hold and resume (trip {trip.date}).</Notice>
    </Sheet>
  );
}
