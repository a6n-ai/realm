import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { addMonth, monthGrid, weekdayLabels } from "@/lib/sessions/calendar";

export type CalendarEvent = {
  publicId: string;
  title: string;
  occursOn: string;
  timeLabel: string;
  published: boolean;
};

export function SessionsCalendar({
  month,
  today,
  events,
  canCreate,
}: {
  month: string;
  today: string;
  events: CalendarEvent[];
  canCreate: boolean;
}) {
  const grid = monthGrid(month);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = byDay.get(event.occursOn) ?? [];
    list.push(event);
    byDay.set(event.occursOn, list);
  }
  const prev = addMonth(month, -1);
  const next = addMonth(month, 1);
  const label = new Intl.DateTimeFormat("en-SG", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00.000Z`),
  );

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon-sm">
            <Link href={`/dashboard/sessions?month=${prev}`} aria-label="Previous month">
              <ChevronLeftIcon />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon-sm">
            <Link href={`/dashboard/sessions?month=${next}`} aria-label="Next month">
              <ChevronRightIcon />
            </Link>
          </Button>
          <p className="px-2 text-sm font-semibold tracking-tight">{label}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard/sessions?month=${today.slice(0, 7)}`}>Today</Link>
        </Button>
      </div>
      <div className="grid grid-cols-7 border-b">
        {weekdayLabels().map((day) => (
          <p key={day} className="text-muted-foreground px-2 py-2 text-center text-[11px] font-medium tracking-wide uppercase">
            {day}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((cell) => {
          const dayEvents = byDay.get(cell.date) ?? [];
          const isToday = cell.date === today;
          return (
            <div
              key={cell.date}
              className={cn(
                "min-h-24 border-r border-b p-1.5 last:border-r-0",
                !cell.inMonth && "bg-muted/30",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-full text-xs tabular-nums",
                    isToday && "bg-primary text-primary-foreground font-semibold",
                    !isToday && !cell.inMonth && "text-muted-foreground",
                  )}
                >
                  {Number(cell.date.slice(8, 10))}
                </span>
                {canCreate ? (
                  <Link
                    href={`/dashboard/sessions/new?date=${cell.date}`}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-6 place-items-center rounded-md"
                    aria-label={`Schedule a session on ${cell.date}`}
                  >
                    <PlusIcon className="size-3.5" />
                  </Link>
                ) : null}
              </div>
              <ul className="mt-1 grid gap-1">
                {dayEvents.map((event) => (
                  <li key={event.publicId}>
                    <Link
                      href={`/dashboard/sessions/${event.publicId}`}
                      className={cn(
                        "block truncate rounded-md px-1.5 py-0.5 text-[11px] leading-4",
                        event.published ? "bg-primary/10 text-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <span className="font-medium">{event.timeLabel}</span> {event.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
