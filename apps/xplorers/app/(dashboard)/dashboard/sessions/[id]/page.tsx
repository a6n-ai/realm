import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDaysIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { requirePermission, roleCan } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { formatClassClock, formatSessionDay } from "@/lib/sessions/format";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { SessionRowActions } from "../session-row-actions";

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ studioSession: ["read"] } as never);
  const { id } = await params;
  if (id.startsWith("stn")) {
    redirect(`/dashboard/classes/${id}`);
  }

  const [timeZone, session] = await Promise.all([studioSessionsService.timezone(), getSession()]);
  const row = await studioSessionsService.readOccurrence(id, timeZone).catch(() => null);
  if (!row || row.archived) notFound();
  const canWrite = session?.user ? roleCan(session.user.role, { studioSession: ["update"] } as never) : false;

  return (
    <PageShell>
      <PageHeader
        icon={CalendarDaysIcon}
        title={row.title}
        subtitle={`${formatSessionDay(row.startsAt, timeZone)} · ${formatClassClock(row.startsAt, row.endsAt, timeZone)}`}
        actions={canWrite ? <SessionRowActions publicId={row.publicId} canWrite={canWrite} showView={false} /> : null}
      />
      <SectionCard title="Session">
        <dl className="grid max-w-xl gap-4 text-sm sm:grid-cols-2">
          <div className="grid gap-1">
            <dt className="text-muted-foreground">Class</dt>
            <dd>
              <Link href={`/dashboard/classes/${row.classPublicId}`} className="underline-offset-4 hover:underline">
                {row.title}
              </Link>
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-muted-foreground">Date</dt>
            <dd className="tabular-nums">{row.occursOn}</dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-muted-foreground">Time</dt>
            <dd>{formatClassClock(row.startsAt, row.endsAt, timeZone)}</dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-muted-foreground">Seats</dt>
            <dd className="tabular-nums">
              {row.remaining} left of {row.capacity}
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Badge variant={row.published ? "default" : "outline"}>{row.published ? "Published" : "Draft"}</Badge>
            </dd>
          </div>
          {row.location ? (
            <div className="grid gap-1">
              <dt className="text-muted-foreground">Location</dt>
              <dd>{row.location}</dd>
            </div>
          ) : null}
        </dl>
        <Button asChild variant="outline" size="sm" className="mt-6">
          <Link href={`/dashboard/sessions/new?class=${row.classPublicId}`}>Schedule another day</Link>
        </Button>
      </SectionCard>
    </PageShell>
  );
}
