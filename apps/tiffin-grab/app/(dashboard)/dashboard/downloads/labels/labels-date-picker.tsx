"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Calendar } from "@foundry/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { formatDateOnly } from "@/lib/format/datetime";

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Same Popover+Calendar pattern as the menus WeekStartPicker, minus its Monday-only
// constraint — any delivery date is selectable here.
export function LabelsDatePicker({ value }: { value: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-56 justify-start gap-2 font-normal tabular-nums transition-transform active:scale-[0.96]"
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
          {value ? formatDateOnly(value, { mode: "weekday" }) : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (d) router.push(`/dashboard/downloads/labels?date=${toIso(d)}`);
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
