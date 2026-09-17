import Link from "next/link";
import { Suspense } from "react";
import { CalendarDaysIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { requirePermission, roleCan } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { SessionsTable, SessionsTableSkeleton } from "./sessions-table";

export default function SessionsPage() {
  return (
    <PageShell>
      <SessionsHeader />
      <SectionCard title="All sessions">
        <Suspense fallback={<SessionsTableSkeleton />}>
          <SessionsData />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function SessionsHeader() {
  const session = await getSession();
  const canCreate = session?.user ? roleCan(session.user.role, { studioSession: ["create"] } as never) : false;
  return (
    <PageHeader
      icon={CalendarDaysIcon}
      title="Sessions"
      subtitle="Bookable one-day classes. Add more dates when the same class runs again."
      actions={
        canCreate ? (
          <Button asChild size="sm">
            <Link href="/dashboard/sessions/new">New session</Link>
          </Button>
        ) : null
      }
    />
  );
}

async function SessionsData() {
  await requirePermission({ studioSession: ["read"] } as never);
  const session = await getSession();
  const canWrite = session?.user ? roleCan(session.user.role, { studioSession: ["update"] } as never) : false;
  const [rows, timeZone] = await Promise.all([studioSessionsService.listAdmin(), studioSessionsService.timezone()]);
  return <SessionsTable rows={rows} timeZone={timeZone} canWrite={canWrite} />;
}
