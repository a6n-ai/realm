"use client";

// The body of "tap a day = meal selection for that day": shared verbatim by the desktop
// persistent panel (delivery-calendar.tsx) and the mobile Drawer. Locked days are viewable but
// not editable (CutoffBanner only); everything else before cutoff gets the interactive
// MealDayPicker. Never renders pause/resume — that's a separate control (pause-calendar.tsx),
// decoupled from day-click on purpose.

import { weekdayKey } from "@realm/commons";
import { cn } from "@realm/ui/cn";
import { formatDateOnly, formatEpoch } from "@/lib/format/datetime";
import { CutoffBanner } from "@/components/customer/meals/cutoff-banner";
import type { CalendarCell } from "./calendar-constants";
import { DAY_STATUS_BAR_CLASS, DAY_STATUS_LABEL, calendarDayStatus, type DayStatus } from "./day-status";
import { mealChips } from "./meal-chips";
import { MealDayPicker } from "./meal-day-picker";
import type { CustomerDelivery } from "@/lib/services/customer-deliveries.service";
import type { DeliveryCardMeal } from "./meal-chips";

type DeliveryCardData = CustomerDelivery & { meal: DeliveryCardMeal };

export function DayDetail({
  dateIso, cell, delivery, orderPublicId, categoryLabels, tz, onChanged,
}: {
  dateIso: string;
  cell: CalendarCell | undefined;
  delivery: DeliveryCardData | undefined;
  orderPublicId: string;
  categoryLabels: Record<string, string>;
  tz: string;
  onChanged: () => void;
}) {
  const status: DayStatus = cell ? calendarDayStatus(cell) : "locked";
  const chips = delivery ? mealChips(delivery.meal) : [];

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "relative rounded-lg border bg-card py-2 pr-3 pl-6 text-sm",
          "after:absolute after:inset-y-2 after:left-2 after:w-1 after:rounded-full",
          DAY_STATUS_BAR_CLASS[status],
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">{formatDateOnly(dateIso, { mode: "weekday" })}</p>
          <span className="text-muted-foreground text-xs">{DAY_STATUS_LABEL[status]}</span>
        </div>
        {delivery && (
          "pending" in delivery.meal ? (
            <p className="mt-1 text-muted-foreground text-xs">Menu not published yet</p>
          ) : chips.length === 0 ? (
            <p className="mt-1 text-muted-foreground text-xs">Nothing scheduled</p>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {chips.map((c, i) => (
                <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs">{c}</span>
              ))}
            </div>
          )
        )}
        {!delivery && !cell && <p className="mt-1 text-muted-foreground text-xs">No delivery this day.</p>}
        {status === "locked" && delivery && (
          <p className="mt-1 text-muted-foreground text-xs">
            Cutoff passed {formatEpoch(delivery.cutoffAt, { mode: "datetime", timeZone: tz })}
          </p>
        )}
      </div>

      {status === "locked" ? (
        delivery && !("pending" in delivery.meal) ? (
          <CutoffBanner days={[{ dateIso, dayOfWeek: weekdayKey(new Date(`${dateIso}T00:00:00Z`)), lockMs: delivery.cutoffAt }]} />
        ) : null
      ) : cell ? (
        <MealDayPicker cell={cell} orderPublicId={orderPublicId} categoryLabels={categoryLabels} onChanged={onChanged} />
      ) : null}
    </div>
  );
}
