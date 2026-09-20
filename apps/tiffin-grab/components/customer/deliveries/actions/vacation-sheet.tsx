"use client";
import { Notice, Sheet } from "@/components/customer/kit";
import type { ActionSheetProps } from "./types";

export function VacationSheet({ trip, open, onDone }: ActionSheetProps) {
  return (
    <Sheet open={open} onClose={onDone} title="Vacation">
      <Notice>Coming next: start, end, resume (trip {trip.date}).</Notice>
    </Sheet>
  );
}
