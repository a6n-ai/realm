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
      <SectionCard title="What's next">
        <p className="text-muted-foreground text-sm">
          Auth, public pages, and this console are in place. Classes, bookings, and the rest of the Science Explorers
          Club product land in later passes.
        </p>
      </SectionCard>
    </PageShell>
  );
}
