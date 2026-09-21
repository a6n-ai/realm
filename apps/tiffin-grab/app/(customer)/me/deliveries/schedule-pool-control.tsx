"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@/components/ds";
import { formatDateOnly } from "@/lib/format/datetime";
import type { TiffinCounts } from "@/lib/services/customer-deliveries.service";
import {
  formatEatDayCarryPreview,
  previewEatDayCarry,
} from "@/lib/menu/carry-trip";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { ActionCard, DELIVERY_SHEET_DIRECTION } from "./action-card";
import { VacationDateField } from "./vacation-date-field";
import { scheduleMyPooledTiffin } from "./actions";
import { DialogFooterRow, IOS_BUTTON } from "@/components/customer/ios-button";

/**
 * Place a pooled tiffin by picking the day the customer wants to EAT. Weekends and
 * off-pattern days snap to the carrying trip (same helper as reschedule).
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
  const [date, setDate] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const last = counts.lastDeliveryDate;
  const weekdays = counts.deliveryWeekdays as DayOfWeek[];
  const preview = date && weekdays.length ? previewEatDayCarry(date, weekdays) : null;

  function reset() {
    setDate("");
    setError(null);
  }

  function submit() {
    if (!date) return;
    setError(null);
    startTransition(async () => {
      const result = await scheduleMyPooledTiffin(orderPublicId, date);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      reset();
      setOpen(false);
      const carried = "carriedOn" in result ? result.carriedOn : null;
      // toast via router refresh only — dialog closes; optional success is fine silent
      void carried;
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      direction={DELIVERY_SHEET_DIRECTION}
      trigger={
        <ActionCard
          icon={CalendarPlusIcon}
          title={counts.pooled > 1 ? `Schedule ${counts.pooled} tiffins` : "Schedule a tiffin"}
          description="Pick the day you want to eat"
        />
      }
      title="Schedule a tiffin"
      description="Place one of your unscheduled tiffins by the day you want to eat."
      footer={
        <DialogFooterRow>
          <Button variant="secondary" className={IOS_BUTTON} disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button className={IOS_BUTTON} disabled={!date || pending} onClick={submit}>
            <CalendarPlusIcon data-icon="inline-start" />
            {pending ? "Scheduling…" : "Schedule"}
          </Button>
        </DialogFooterRow>
      }
    >
      <div className="space-y-4 px-4 pb-4">
        <p className="text-muted-foreground text-sm">
          You have <span className="text-foreground font-medium">{counts.pooled}</span> tiffin
          {counts.pooled > 1 ? "s" : ""} to schedule
          {last ? ` after ${formatDateOnly(last, { mode: "short" })}` : ""}.
          Weekends and off-pattern days ship with the nearest earlier delivery.
        </p>
        <VacationDateField
          id="schedule-pool-date"
          label="Day you want to eat"
          value={date}
          onChange={setDate}
          today={today}
          minDate={today}
        />
        {preview ? (
          <p className="bg-muted/50 text-foreground rounded-xl border px-3 py-2 text-sm" aria-live="polite">
            {formatEatDayCarryPreview(preview, {
              targetAlreadyHasTrip: Boolean(last && preview.carriedOn <= last),
            })}
          </p>
        ) : null}
        {error && <p className="text-bad text-xs">{error}</p>}
      </div>
    </ResponsiveDialog>
  );
}
