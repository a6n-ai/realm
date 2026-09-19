import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlusIcon, ShapesIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard, parseFilterState } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { requirePermission, roleCan } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { parseSort } from "@/lib/list/sort";
import { formatSessionTime } from "@/lib/sessions/format";
import { clockFrom } from "@/lib/sessions/schedule";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { SESSION_FACETS, SESSION_SORT_COLUMNS } from "@/lib/studio/list-spec";
import { SessionsTable } from "../../sessions/sessions-table";
import { ClassForm } from "../class-form";
import { ClassRowActions } from "../class-row-actions";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function EditClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  await requirePermission({ studioSession: ["read"] } as never);
  const { id } = await params;
  const [row, timeZone, session] = await Promise.all([
    studioSessionsService.read(id).catch(() => null),
    studioSessionsService.timezone(),
    getSession(),
  ]);
  if (!row || row.archived) notFound();
  const canWrite = session?.user ? roleCan(session.user.role, { studioSession: ["update"] } as never) : false;
  const canCreate = session?.user ? roleCan(session.user.role, { studioSession: ["create"] } as never) : false;
  const sp = await searchParams;
  const sort = parseSort(sp, SESSION_SORT_COLUMNS, { column: "occursOn", dir: "desc" });
  const { condition, page } = parseFilterState(SESSION_FACETS, sp);
  const sessions = await studioSessionsService.querySessions(condition, page, sort, {
    classPublicId: row.publicId,
    timeZone,
  });

  return (
    <PageShell>
      <PageHeader
        icon={ShapesIcon}
        title={row.title}
        subtitle="Edit the offering. Sessions stay history when they end — schedule another day instead of adding dates here."
        actions={canWrite ? <ClassRowActions publicId={row.publicId} published={row.published} canWrite={canWrite} showEdit={false} /> : null}
      />
      <SectionCard title="Class">
        <ClassForm
          publicId={row.publicId}
          timeZone={timeZone}
          readOnly={!canWrite}
          values={{
            title: row.title,
            category: row.category,
            description: row.description ?? "",
            startsAt: clockFrom(row.startsAt, timeZone),
            endsAt: clockFrom(row.endsAt, timeZone),
            audience: row.audience ?? "",
            capacity: row.capacity,
            priceDisplay: row.priceDisplay ?? "",
            priceAmount: row.priceAmount,
            location: row.location ?? "",
            attendanceMode: row.attendanceMode,
            published: row.published,
            photos: row.photos ?? [],
          }}
        />
      </SectionCard>
      <SectionCard
        title="Sessions"
        action={
          canCreate ? (
            <Button asChild size="sm">
              <Link href={`/dashboard/sessions/new?class=${row.publicId}`}>
                <CalendarPlusIcon />
                Schedule session
              </Link>
            </Button>
          ) : null
        }
      >
        <SessionsTable
          spec={SESSION_FACETS}
          rows={sessions.items.map((item) => ({
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
          total={sessions.total}
          page={page.page}
          size={page.size}
          canWrite={canWrite}
          hideClass
        />
      </SectionCard>
    </PageShell>
  );
}
