import Link from "next/link";
import { CompassIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { getSession } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/guards";
import { SITE_NAME } from "@/lib/brand";

export default async function DashboardHomePage() {
  const session = await getSession();
  const canStudio = session?.user ? roleCan(session.user.role, { studioSession: ["read"] } as never) : false;
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
      <SectionCard title="Studio">
        <p className="text-muted-foreground text-sm">
          Classes are the catalog. Sessions are the days families book. Remaining seats are computed on the server.
        </p>
        {canStudio ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/dashboard/classes">Open classes</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/sessions">Open sessions</Link>
            </Button>
          </div>
        ) : null}
      </SectionCard>
    </PageShell>
  );
}
