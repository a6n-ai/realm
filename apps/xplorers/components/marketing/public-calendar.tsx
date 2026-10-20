import { SessionsCalendar } from "@/components/calendar/sessions-calendar";
import { getSession } from "@/lib/auth/session";
import { monthGrid } from "@/lib/sessions/calendar";
import { isRealDay, parseRange, toCalendarSessions } from "@/lib/sessions/calendar-events";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { dayKey } from "@/lib/sessions/timezone";

/** Published sessions on the shared calendar; a click goes to booking, or to login first. */
export async function PublicCalendar({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const [timeZone, session] = await Promise.all([studioSessionsService.timezone(), getSession()]);
  const today = dayKey(new Date(), timeZone);
  const grid = monthGrid(today.slice(0, 7));
  const { from, to } = parseRange(searchParams.from, searchParams.to, {
    from: grid[0]!.date,
    to: grid[grid.length - 1]!.date,
  });
  const rows = await studioSessionsService.listRange(from, to, { publicOnly: true });
  return (
    <SessionsCalendar
      sessions={toCalendarSessions(rows)}
      defaultView={searchParams.view === "month" ? "month" : "week"}
      defaultDate={isRealDay(searchParams.date) ? searchParams.date : today}
      timeZone={timeZone}
      from={from}
      to={to}
      target={session?.user ? "book" : "login"}
    />
  );
}
