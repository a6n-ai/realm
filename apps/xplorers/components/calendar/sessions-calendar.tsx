"use client";

import { useMemo, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EventCalendar } from "@/components/reui/event-calendar/event-calendar";
import { EventCalendarContent } from "@/components/reui/event-calendar/event-calendar-content";
import { EventCalendarNav } from "@/components/reui/event-calendar/event-calendar-nav";
import type { CalendarEvent, EventCalendarRangeInfo } from "@/components/reui/event-calendar/event-calendar-types";
import { colorVar, type CalendarSession } from "@/lib/sessions/calendar-events";
import { dayKey } from "@/lib/sessions/timezone";

/** Serialisable click targets, so server pages can choose one without passing a function. */
const TARGETS = {
  admin: (id: string) => `/dashboard/sessions/${id}`,
  book: (id: string) => `/me/book?session=${id}`,
  login: (id: string) => `/login?next=${encodeURIComponent(`/me/book?session=${id}`)}`,
};

export function SessionsCalendar({
  sessions,
  defaultView = "month",
  defaultDate,
  timeZone,
  from,
  to,
  onSelect,
  target = "admin",
  canCreate = false,
  toolbar,
}: {
  sessions: CalendarSession[];
  defaultView?: "month" | "week";
  /** YYYY-MM-DD the calendar opens on. */
  defaultDate: string;
  timeZone: string;
  /** Inclusive day keys the server already loaded; navigating inside them needs no refetch. */
  from: string;
  to: string;
  onSelect?: (publicId: string) => void;
  /** Where a click goes when onSelect is not given: admin detail, the booking page, or login first. */
  target?: keyof typeof TARGETS;
  /** When the viewer may schedule, clicking a day opens the new-session form on it. */
  canCreate?: boolean;
  toolbar?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const events = useMemo<CalendarEvent<{ cancelled: boolean }>[]>(
    () =>
      sessions.map((s) => ({
        id: s.publicId,
        title: s.title,
        start: new Date(s.startsAt),
        end: new Date(s.endsAt),
        color: s.cancelled ? "#71717a" : colorVar(s.color),
        readOnly: true,
        data: { cancelled: s.cancelled },
      })),
    [sessions],
  );

  const onRangeChange = ({ range, view, date }: EventCalendarRangeInfo) => {
    const nextFrom = dayKey(range.start, timeZone);
    const nextTo = dayKey(new Date(range.end.getTime() - 1), timeZone);
    const nextView = view === "week" ? "week" : "month";
    const sameView = (params.get("view") ?? defaultView) === nextView;
    if (sameView && nextFrom >= from && nextTo <= to) return;
    const next = new URLSearchParams(params.toString());
    next.set("from", nextFrom);
    next.set("to", nextTo);
    next.set("view", nextView);
    next.set("date", dayKey(date, timeZone));
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return (
    <EventCalendar
      events={events}
      defaultView={defaultView}
      defaultDate={new Date(`${defaultDate}T12:00:00`)}
      views={["month", "week"]}
      timeZone={timeZone}
      weekStartsOn={1}
      defaultInteractions={{ drag: false, resize: false, selectSlot: false }}
      onRangeChange={onRangeChange}
      onEventClick={(occ) => (onSelect ?? ((id) => router.push(TARGETS[target](id))))(occ.event.id)}
      onSlotClick={canCreate ? (slot) => router.push(`/dashboard/sessions/new?date=${dayKey(slot.date, timeZone)}`) : undefined}
      showDayAddButton={canCreate}
      className="h-[calc(100dvh-16rem)] min-h-[32rem]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EventCalendarNav className="flex-1" />
        {toolbar}
      </div>
      <EventCalendarContent />
    </EventCalendar>
  );
}
