import Link from "next/link";
import { Suspense } from "react";
import { CalendarDaysIcon, CalendarPlusIcon, ListIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard, parseFilterState } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { requirePermission, roleCan } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { parseSort } from "@/lib/list/sort";
import { monthGrid } from "@/lib/sessions/calendar";
import { toCalendarSessions } from "@/lib/sessions/calendar-events";
import { formatSessionTime } from "@/lib/sessions/format";
import { addDayKey, dayKey } from "@/lib/sessions/timezone";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { SESSION_FACETS, SESSION_SORT_COLUMNS } from "@/lib/studio/list-spec";
import { CopyWeekButton } from "./copy-week-button";
import { SessionsCalendar } from "@/components/calendar/sessions-calendar";
import { CalendarEmpty, CalendarSkeleton } from "./calendar-states";
import { SessionsTable, SessionsTableSkeleton } from "./sessions-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function SessionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <SessionsHeader searchParams={searchParams} />
      <Suspense fallback={<CalendarSkeleton />}>
        <SessionsData searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function SessionsHeader({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  const canCreate = session?.user ? roleCan(session.user.role, { studioSession: ["create"] } as never) : false;
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "calendar";
  const calendarHref = "/dashboard/sessions";
  const listHref = "/dashboard/sessions?view=list";

  return (
    <PageHeader
      icon={CalendarDaysIcon}
      title="Sessions"
      subtitle="One day on the calendar. Pick a class, put it on a date. Ended days stay here."
      actions={
        <div className="flex items-center gap-2">
          <div className="bg-muted flex rounded-lg p-0.5">
            <Button asChild size="sm" variant={view === "calendar" ? "default" : "ghost"}>
              <Link href={calendarHref}>
                <CalendarDaysIcon />
                Calendar
              </Link>
            </Button>
            <Button asChild size="sm" variant={view === "list" ? "default" : "ghost"}>
              <Link href={listHref}>
                <ListIcon />
                List
              </Link>
            </Button>
          </div>
          {canCreate ? (
            <Button asChild size="sm">
              <Link href="/dashboard/sessions/new">
                <CalendarPlusIcon />
                New session
              </Link>
            </Button>
          ) : null}
        </div>
      }
    />
  );
}

async function SessionsData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ studioSession: ["read"] } as never);
  const session = await getSession();
  const canWrite = session?.user ? roleCan(session.user.role, { studioSession: ["update"] } as never) : false;
  const canCreate = session?.user ? roleCan(session.user.role, { studioSession: ["create"] } as never) : false;
  const sp = await searchParams;
  const timeZone = await studioSessionsService.timezone();
  const view = sp.view === "list" ? "list" : "calendar";
  const today = dayKey(new Date(), timeZone);

  if (view === "calendar") {
    const grid = monthGrid(today.slice(0, 7));
    const day = /^\d{4}-\d{2}-\d{2}$/;
    const from = sp.from && day.test(sp.from) ? sp.from : grid[0]!.date;
    const to = sp.to && day.test(sp.to) ? sp.to : grid[grid.length - 1]!.date;
    const calendarView = sp.view === "week" ? "week" : "month";
    const date = sp.date && day.test(sp.date) ? sp.date : today;
    const rows = await studioSessionsService.listRange(from, to, { publicOnly: false });
    const thisMonday = addDayKey(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
    return (
      <SectionCard title="Calendar">
        {rows.length === 0 && canCreate ? <CalendarEmpty /> : null}
        <SessionsCalendar
          sessions={toCalendarSessions(rows)}
          defaultView={calendarView}
          defaultDate={date}
          timeZone={timeZone}
          from={from}
          to={to}
          canCreate={canCreate}
          toolbar={canCreate ? <CopyWeekButton fromMonday={addDayKey(thisMonday, -7)} toMonday={thisMonday} /> : undefined}
        />
      </SectionCard>
    );
  }

  const sort = parseSort(sp, SESSION_SORT_COLUMNS, { column: "occursOn", dir: "desc" });
  const { condition, page } = parseFilterState(SESSION_FACETS, sp);
  const result = await studioSessionsService.querySessions(condition, page, sort, { timeZone });

  return (
    <SectionCard title="All sessions">
      <SessionsTable
        spec={SESSION_FACETS}
        rows={result.items.map((item) => ({
          publicId: item.publicId,
          classPublicId: item.classPublicId,
          title: item.title,
          category: item.category,
          occursOn: item.occursOn,
          timeLabel: formatSessionTime(item.startsAt, timeZone),
          remaining: item.remaining,
          capacity: item.capacity,
          published: item.published,
        }))}
        sort={sort}
        total={result.total}
        page={page.page}
        size={page.size}
        canWrite={canWrite}
      />
    </SectionCard>
  );
}
