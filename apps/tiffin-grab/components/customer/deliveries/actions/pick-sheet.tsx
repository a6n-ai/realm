"use client";
import Link from "next/link";
import { Button, Notice, Sheet } from "@/components/customer/kit";
import type { ActionSheetProps } from "./types";

export function PickSheet({ trip, open, onDone }: ActionSheetProps) {
  return (
    <Sheet open={open} onClose={onDone} title="Pick meals" footer={<Link href={`/me/meals?date=${trip.date}`} className="block"><Button variant="primary" size="lg" className="w-full">Open this week&apos;s menu</Button></Link>}>
      <Notice>Coming next: choose dishes per eating day, then open this week&apos;s menu (trip {trip.date}).</Notice>
    </Sheet>
  );
}
