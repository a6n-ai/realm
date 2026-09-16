import Link from "next/link";
import { CompassIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { getSession } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/guards";
import { SITE_NAME } from "@/lib/brand";

export default async function DashboardHomePage() {
  const session = await getSession();
  const canUsers = session?.user ? roleCan(session.user.role, { user: ["list"] }) : false;

  return (
    <PageShell>
      <PageHeader
        icon={CompassIcon}
        title="Dashboard"
        subtitle={`${SITE_NAME} operations. Feature work starts from here.`}
        actions={
          canUsers ? (
            <Button asChild size="sm">
              <Link href="/dashboard/settings/users">Manage users</Link>
            </Button>
          ) : null
        }
      />
      <SectionCard title="Sessions">
        <p className="text-muted-foreground text-sm">
          Publish bookable sessions for the public calendar. Families book from What’s on; remaining seats are computed
          on the server.
        </p>
        {session?.user && roleCan(session.user.role, { studioSession: ["read"] } as never) ? (
          <Button asChild size="sm" className="mt-4">
            <Link href="/dashboard/sessions">Open sessions</Link>
          </Button>
        ) : null}
      </SectionCard>
    </PageShell>
  );
}
