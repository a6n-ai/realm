"use client";

import { useMemo } from "react";
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
          // Narrow cells: the status alone, plus a count only when one delivery carries several tiffins.
          const tiffins = d.truck && d.units > 1 ? ` · ${d.units}` : "";
          return {
            id: `${date}-${i}`,
            title: `${BOX_LABEL[s]}${tiffins}`,
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
      onSlotClick={(slot) => {
        const iso = isoOf(slot.date);
        if (agenda[iso]) onPickDay(iso);
      }}
      className="min-h-0 flex-1"
    >
      <EventCalendarNav showViewSwitcher={false} />
      <EventCalendarContent />
    </EventCalendar>
  );
}
