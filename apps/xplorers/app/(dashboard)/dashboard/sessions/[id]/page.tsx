import { notFound } from "next/navigation";
import { CalendarDaysIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { requirePermission, roleCan } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { toZonedLocal } from "@/lib/sessions/timezone";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { ArchiveSessionButton } from "../archive-button";
import { SessionForm } from "../session-form";

export default async function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ studioSession: ["read"] } as never);
  const { id } = await params;
  const [row, timeZone, session] = await Promise.all([
    studioSessionsService.readWithDates(id).catch(() => null),
    studioSessionsService.timezone(),
    getSession(),
  ]);
  if (!row || row.archived) notFound();
  const canWrite = session?.user ? roleCan(session.user.role, { studioSession: ["update"] } as never) : false;

  return (
    <PageShell>
      <PageHeader
        icon={CalendarDaysIcon}
        title={row.title}
        subtitle="Edit the class. Each date is one day families can book; remaining seats are computed server-side."
        actions={canWrite ? <ArchiveSessionButton publicId={row.publicId} /> : null}
      />
      <SectionCard title="Session">
        <SessionForm
          publicId={row.publicId}
          timeZone={timeZone}
          readOnly={!canWrite}
          values={{
            title: row.title,
            category: row.category,
            description: row.description ?? "",
            startsAt: toZonedLocal(row.startsAt, timeZone),
            endsAt: toZonedLocal(row.endsAt, timeZone),
            audience: row.audience ?? "",
            capacity: row.capacity,
            priceDisplay: row.priceDisplay ?? "",
            location: row.location ?? "",
            attendanceMode: row.attendanceMode,
            published: row.published,
            extraDates: row.dates.filter((date) => date !== toZonedLocal(row.startsAt, timeZone).slice(0, 10)),
          }}
        />
      </SectionCard>
    </PageShell>
  );
}
