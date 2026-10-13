"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { placeHolidayDayAction } from "./actions";

/** Staff pick the first day; the service takes the first free plan weekdays on or after it and validates the date. */
export function PlaceForm({ deliveryPublicId, today }: { deliveryPublicId: string; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex items-center justify-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await placeHolidayDayAction(deliveryPublicId, date);
          if ("error" in res) return void toast.error(res.error);
          toast.success(res.message);
          router.refresh();
        });
      }}
    >
      <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} aria-label="First day to place on" className="w-40" />
      <Button size="sm" type="submit" disabled={pending || !date}>Place</Button>
    </form>
  );
}
