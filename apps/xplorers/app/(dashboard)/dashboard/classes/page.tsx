import Link from "next/link";
import { Suspense } from "react";
import { ShapesIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard, parseFilterState } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { requirePermission, roleCan } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { parseSort } from "@/lib/list/sort";
import { formatClassClock } from "@/lib/sessions/format";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { CLASS_FACETS, CLASS_SORT_COLUMNS } from "@/lib/studio/list-spec";
import { ClassesTable, ClassesTableSkeleton } from "./classes-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function ClassesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <ClassesHeader />
      <SectionCard title="All classes">
        <Suspense fallback={<ClassesTableSkeleton />}>
          <ClassesData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function ClassesHeader() {
  const session = await getSession();
  const canCreate = session?.user ? roleCan(session.user.role, { studioSession: ["create"] } as never) : false;
  return (
    <PageHeader
      icon={ShapesIcon}
      title="Classes"
      subtitle="The catalog. Name, clock, photos, capacity. Schedule days from Sessions."
      actions={
        canCreate ? (
          <Button asChild size="sm">
            <Link href="/dashboard/classes/new">New class</Link>
          </Button>
        ) : null
      }
    />
  );
}

async function ClassesData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ studioSession: ["read"] } as never);
  const session = await getSession();
  const canWrite = session?.user ? roleCan(session.user.role, { studioSession: ["update"] } as never) : false;
  const sp = await searchParams;
  const sort = parseSort(sp, CLASS_SORT_COLUMNS, { column: "title", dir: "asc" });
  const { condition, page } = parseFilterState(CLASS_FACETS, sp);
  const [result, timeZone] = await Promise.all([
    studioSessionsService.queryClasses(condition, page, sort),
    studioSessionsService.timezone(),
  ]);

  return (
    <ClassesTable
      spec={CLASS_FACETS}
      rows={result.items.map((row) => ({
        publicId: row.publicId,
        title: row.title,
        category: row.category,
        timeLabel: formatClassClock(row.startsAt, row.endsAt, timeZone),
        capacity: row.capacity,
        published: row.published,
        sessionCount: row.sessionCount,
      }))}
      sort={sort}
      total={result.total}
      page={page.page}
      size={page.size}
      canWrite={canWrite}
    />
  );
}
