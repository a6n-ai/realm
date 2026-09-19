import Link from "next/link";
import { Suspense } from "react";
import { CalendarDaysIcon, CalendarPlusIcon, ListIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard, parseFilterState } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { requirePermission, roleCan } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { parseSort } from "@/lib/list/sort";
import { parseMonth } from "@/lib/sessions/calendar";
import { formatSessionTime } from "@/lib/sessions/format";
import { dayKey } from "@/lib/sessions/timezone";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { SESSION_FACETS, SESSION_SORT_COLUMNS } from "@/lib/studio/list-spec";
import { SessionsCalendar } from "./sessions-calendar";
import { SessionsTable, SessionsTableSkeleton } from "./sessions-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function SessionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <SessionsHeader searchParams={searchParams} />
      <Suspense fallback={<SessionsTableSkeleton />}>
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
  const month = sp.month;
  const calendarHref = month ? `/dashboard/sessions?month=${month}` : "/dashboard/sessions";
  const listHref = month ? `/dashboard/sessions?view=list&month=${month}` : "/dashboard/sessions?view=list";

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
  const month = parseMonth(sp.month, timeZone);
  const today = dayKey(new Date(), timeZone);

  if (view === "calendar") {
    const events = await studioSessionsService.listMonth(month, timeZone);
    return (
      <SectionCard title="Month">
        <SessionsCalendar
          month={month}
          today={today}
          canCreate={canCreate}
          events={events.map((item) => ({
            publicId: item.publicId,
            title: item.title,
            occursOn: item.occursOn,
            timeLabel: formatSessionTime(item.startsAt, timeZone),
            published: item.published,
          }))}
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
