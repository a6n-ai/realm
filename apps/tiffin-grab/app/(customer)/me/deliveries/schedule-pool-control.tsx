"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlusIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { ResponsiveDialog } from "@/components/ds";
import { formatDateOnly } from "@/lib/format/datetime";
import type { TiffinCounts } from "@/lib/services/customer-deliveries.service";
import { VacationDateField } from "./vacation-date-field";
import { scheduleMyPooledTiffin } from "./actions";

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
  const [date, setDate] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const last = counts.lastDeliveryDate;

  function reset() {
    setDate("");
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
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          You have <span className="text-foreground font-medium">{counts.pooled}</span> tiffin
          {counts.pooled > 1 ? "s" : ""} to schedule. Pick a delivery day after
          {last ? ` ${formatDateOnly(last, { mode: "short" })}` : " your last delivery"} — it must
          fall on one of your plan&apos;s delivery days.
        </p>
        <VacationDateField
          id="schedule-pool-date"
          label="Delivery day"
          value={date}
          onChange={setDate}
          today={today}
          minDate={last ?? today}
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
