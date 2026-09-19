import Link from "next/link";
import { CalendarDaysIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { requirePermission } from "@/lib/auth/guards";
import { formatClassClock } from "@/lib/sessions/format";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { ScheduleSessionForm } from "../schedule-form";

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; class?: string }>;
}) {
  await requirePermission({ studioSession: ["create"] } as never);
  const [{ date, class: classPublicId }, timeZone, options] = await Promise.all([
    searchParams,
    studioSessionsService.timezone(),
    studioSessionsService.listClassOptions(),
  ]);

  return (
    <PageShell>
      <PageHeader
        icon={CalendarDaysIcon}
        title="New session"
        subtitle="Pick a class and a day. The clock and capacity come from the class."
      />
      <SectionCard title="Session">
        {options.length === 0 ? (
          <div className="grid gap-3">
            <p className="text-muted-foreground text-sm">Create a class first, then put it on a day.</p>
            <Button asChild size="sm" className="w-fit">
              <Link href="/dashboard/classes/new">New class</Link>
            </Button>
          </div>
        ) : (
          <ScheduleSessionForm
            defaultClassId={classPublicId}
            defaultDate={date}
            classes={options.map((item) => ({
              publicId: item.publicId,
              title: item.title,
              capacity: item.capacity,
              timeLabel: formatClassClock(item.startsAt, item.endsAt, timeZone),
            }))}
          />
        )}
      </SectionCard>
    </PageShell>
  );
}
