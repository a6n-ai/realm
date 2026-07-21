"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlusIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { ResponsiveDialog } from "@/components/ds";
import { formatDateOnly } from "@/lib/format/datetime";
import type { TiffinCounts } from "@/lib/services/customer-deliveries.service";
import { toIsoLocal } from "./calendar-constants";
import { VacationDateField } from "./vacation-date-field";
import { scheduleMyPooledTiffin } from "./actions";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// delivery_date is a calendar date; parse as UTC so the weekday never shifts across timezones.
function isoWeekdayKey(iso: string): string {
  return WEEKDAY_KEYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;
}

/**
 * Lets a customer place a pooled tiffin on a real date. Only days strictly after the last delivery
 * that fall on a plan weekday are selectable; the server re-validates both. Schedules one tiffin
 * (persons servings) per confirm.
 */
export function SchedulePoolControl({
  orderPublicId,
  counts,
  today,
}: {
  orderPublicId: string;
  counts: TiffinCounts;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [date, setDate] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const weekdays = new Set(counts.deliveryWeekdays);
  const last = counts.lastDeliveryDate;

  function isDisabledDay(d: Date): boolean {
    const iso = toIsoLocal(d);
    if (iso < today) return true;
    if (last && iso <= last) return true; // strictly after the last delivery
    return !weekdays.has(isoWeekdayKey(iso));
  }

  function reset() {
    setDate("");
    setPickerOpen(false);
    setError(null);
  }

  function submit() {
    if (!date) return;
    setError(null);
    startTransition(async () => {
      try {
        await scheduleMyPooledTiffin(orderPublicId, date);
        router.refresh();
        reset();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not schedule that day");
      }
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      trigger={
        <Button variant="outline" size="sm">
          <CalendarPlusIcon data-icon="inline-start" />
          Schedule tiffin{counts.pooled > 1 ? "s" : ""}
        </Button>
      }
      title="Schedule a tiffin"
      description="Place one of your unscheduled tiffins on a delivery day."
    >
      <div className="space-y-4 px-4 pb-4 sm:px-0 sm:pb-0">
        <p className="text-muted-foreground text-sm">
          You have <span className="text-foreground font-medium">{counts.pooled}</span> tiffin
          {counts.pooled > 1 ? "s" : ""} to schedule. Pick a delivery day after
          {last ? ` ${formatDateOnly(last, { mode: "short" })}` : " your last delivery"} — it must
          fall on one of your plan's delivery days.
        </p>
        <VacationDateField
          id="schedule-pool-date"
          label="Delivery day"
          value={date}
          onChange={setDate}
          today={today}
          minDate={last ?? today}
          isDisabledDay={isDisabledDay}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
        />
        {date && (
          <p className="text-muted-foreground text-sm">
            A new delivery will be added on {formatDateOnly(date, { mode: "long" })}
            {counts.persons > 1 ? ` for ${counts.persons} servings` : ""}.
          </p>
        )}
        <Button disabled={!date || pending} onClick={submit}>
          <CalendarPlusIcon data-icon="inline-start" /> Schedule delivery
        </Button>
        {error && <p className="text-bad text-xs">{error}</p>}
      </div>
    </ResponsiveDialog>
  );
}
