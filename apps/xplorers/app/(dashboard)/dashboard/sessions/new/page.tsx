import { CalendarDaysIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { SessionForm } from "../session-form";

export default async function NewSessionPage() {
  await requirePermission({ studioSession: ["create"] } as never);
  const timeZone = await studioSessionsService.timezone();
  return (
    <PageShell>
      <PageHeader icon={CalendarDaysIcon} title="New session" subtitle="Define one bookable offering. Publish when it should appear on What’s on." />
      <SectionCard title="Session">
        <SessionForm timeZone={timeZone} />
      </SectionCard>
    </PageShell>
  );
}
