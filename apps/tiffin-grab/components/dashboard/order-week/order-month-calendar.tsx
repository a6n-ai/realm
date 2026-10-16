"use client";

import { useMemo } from "react";
import { Truck } from "lucide-react";
import { EventCalendar } from "@/components/reui/event-calendar/event-calendar";
import { EventCalendarContent } from "@/components/reui/event-calendar/event-calendar-content";
import { EventCalendarNav } from "@/components/reui/event-calendar/event-calendar-nav";
import type { CalendarEvent } from "@/components/reui/event-calendar/event-calendar-types";
import { STATUS_COLOR, type DeliveryStatus } from "@/components/customer/kit";
import { addDays, dotStatus, type Agenda, type AgendaDot } from "@/lib/deliveries-view/week";

// The statuses staff set in the delivery status dropdown, which splits two the customer strip merges:
// past the cutoff an unconfirmed day is awaiting confirmation, and a driver-failed drop is not an admin hold.
export type BoxStatus = DeliveryStatus | "awaiting" | "not-delivered";
export const BOX_COLOR: Record<BoxStatus, string> = { ...STATUS_COLOR, awaiting: "#8b5cf6", "not-delivered": "#b91c1c" };
export const BOX_LABEL: Record<BoxStatus, string> = {
  delivered: "Delivered",
  upcoming: "Upcoming",
  awaiting: "Awaiting confirmation",
  paused: "Paused",
  hold: "On hold",
  "not-delivered": "Not delivered",
  combined: "Moved",
  holiday: "Holiday",
};

export function boxStatus(d: AgendaDot, now: number): BoxStatus {
  const s = dotStatus(d, now);
  if (s === "hold") return d.optimoCompletionStatus === "failed" ? "not-delivered" : "hold";
  return s === "upcoming" && d.cutoffAt <= now ? "awaiting" : s;
}

const local = (iso: string) => new Date(`${iso}T00:00:00`);
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The whole plan as a month calendar, the Deliveries tab's only navigator. Read-only on purpose:
 * every change goes through the day panel's sheets, which own the cutoff and hold-day rules.
 */
export function OrderMonthCalendar({ agenda, focus, selectedDay, now, onPickDay }: {
  agenda: Agenda;
  /** The day the calendar opens on. */
  focus: string;
  /** Highlighted as the panel's day. */
  selectedDay: string | null;
  now: number;
  onPickDay: (iso: string) => void;
}) {
  const events = useMemo<CalendarEvent<{ date: string }>[]>(
    () =>
      Object.entries(agenda).flatMap(([date, dots]) =>
        dots.map((d, i) => {
          const s = boxStatus(d, now);
          return {
            id: `${date}-${i}`,
            title: BOX_LABEL[s],
            start: local(date),
            end: local(addDays(date, 1)),
            allDay: true,
            color: BOX_COLOR[s],
            readOnly: true,
            data: { date },
          };
        }),
      ),
    [agenda, now],
  );
  // Occurrence keys are `${id}::${startISO}`; selecting the day's chips marks the panel's day on the grid.
  const selection = useMemo(
    () => ({ eventKeys: events.filter((e) => e.data?.date === selectedDay).map((e) => `${e.id}::${e.start.toISOString()}`), slot: null }),
    [events, selectedDay],
  );

  return (
    <EventCalendar
      events={events}
      selection={selection}
      defaultDate={local(focus)}
      views={["month"]}
      weekStartsOn={1}
      defaultInteractions={{ drag: false, resize: false, selectSlot: false }}
      showDayAddButton={false}
      dayClassName={(day) => (isoOf(day) === selectedDay ? "bg-primary/10 ring-2 ring-inset ring-primary" : undefined)}
      onEventClick={(occ) => onPickDay(occ.event.data!.date)}
      // Any day is selectable; one with nothing planned opens the panel's empty state.
      onSlotClick={(slot) => onPickDay(isoOf(slot.date))}
      classNames={{ monthCell: "cursor-pointer" }}
      // The chip is the status; the cell's free space under it says whether a truck comes and with how many tiffins.
      renderMonthCell={({ day, defaultContent }) => {
        const units = (agenda[isoOf(day)] ?? []).filter((d) => d.truck).reduce((n, d) => n + d.units, 0);
        return units > 0 ? (
          <>
            {defaultContent}
            {/* Same row box as the day number (h-5, pb-1.5) so the two sit on one line. */}
            <span className="text-muted-foreground pointer-events-none absolute bottom-1.5 left-2 inline-flex h-5 items-center gap-1 tabular-nums" aria-label={`Delivery, ${units} ${units === 1 ? "tiffin" : "tiffins"}`}>
              <Truck className="size-3.5" aria-hidden />
              {units}
            </span>
          </>
        ) : defaultContent;
      }}
      className="min-h-0 flex-1"
    >
      <EventCalendarNav showViewSwitcher={false} />
      <EventCalendarContent />
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-2 text-xs">
        <span className="inline-flex items-center gap-1"><Truck className="size-3.5" aria-hidden />Delivery day, with the number of tiffins it brings</span>
        <span>Days with a chip but no truck are eaten from an earlier delivery.</span>
      </p>
    </EventCalendar>
  );
}
