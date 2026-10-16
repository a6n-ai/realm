"use client";

import { useMemo } from "react";
import { EventCalendar } from "@/components/reui/event-calendar/event-calendar";
import { EventCalendarContent } from "@/components/reui/event-calendar/event-calendar-content";
import { EventCalendarNav } from "@/components/reui/event-calendar/event-calendar-nav";
import type { CalendarEvent } from "@/components/reui/event-calendar/event-calendar-types";
import { addDays, type Agenda } from "@/lib/deliveries-view/week";
import { BOX_COLOR, BOX_LABEL, boxStatus } from "./delivery-matrix";

const local = (iso: string) => new Date(`${iso}T00:00:00`);
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The whole plan as a month calendar. Read-only on purpose: every change goes through the
 * week hub's sheets, which own the cutoff and hold-day rules. Clicking a day opens it there.
 */
export function OrderMonthCalendar({ agenda, focus, now, onPickDay }: {
  agenda: Agenda;
  /** The day the calendar opens on (the week the hub was showing). */
  focus: string;
  now: number;
  onPickDay: (iso: string) => void;
}) {
  const events = useMemo<CalendarEvent<{ date: string }>[]>(
    () =>
      Object.entries(agenda).flatMap(([date, dots]) =>
        dots.map((d, i) => {
          const s = boxStatus(d, now);
          const tiffins = d.truck ? ` · ${d.units} ${d.units === 1 ? "tiffin" : "tiffins"}` : "";
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

  return (
    <EventCalendar
      events={events}
      defaultDate={local(focus)}
      views={["month"]}
      weekStartsOn={1}
      defaultInteractions={{ drag: false, resize: false, selectSlot: false }}
      showDayAddButton={false}
      onEventClick={(occ) => onPickDay(occ.event.data!.date)}
      onSlotClick={(slot) => {
        const iso = isoOf(slot.date);
        if (agenda[iso]) onPickDay(iso);
      }}
      className="h-[640px]"
    >
      <EventCalendarNav showViewSwitcher={false} />
      <EventCalendarContent />
    </EventCalendar>
  );
}
