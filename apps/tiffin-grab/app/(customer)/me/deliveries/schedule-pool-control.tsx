"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@/components/ds";
import { formatDateOnly } from "@/lib/format/datetime";
import type { TiffinCounts } from "@/lib/services/customer-deliveries.service";
import { ActionCard, DELIVERY_SHEET_DIRECTION } from "./action-card";
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
      direction={DELIVERY_SHEET_DIRECTION}
      trigger={
        <ActionCard
          icon={CalendarPlusIcon}
          title={counts.pooled > 1 ? `Schedule ${counts.pooled} tiffins` : "Schedule a tiffin"}
          description="Place an unscheduled tiffin on a delivery day"
        />
      }
      title="Schedule a tiffin"
      description="Place one of your unscheduled tiffins on a delivery day."
      footer={
        <Button className="w-full" disabled={!date || pending} onClick={submit}>
          <CalendarPlusIcon data-icon="inline-start" />
          {pending ? "Scheduling…" : "Schedule delivery"}
        </Button>
      }
    >
      <div className="space-y-4 px-4 pb-4">
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
        {error && <p className="text-bad text-xs">{error}</p>}
      </div>
    </ResponsiveDialog>
  );
}
