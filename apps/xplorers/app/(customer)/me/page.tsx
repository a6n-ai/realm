import Link from "next/link";
import { CompassIcon } from "lucide-react";
import { EmptyState, PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { getSession } from "@/lib/auth/session";

export default async function CustomerHomePage() {
  const session = await getSession();
  const firstName = session?.user.name?.split(" ")[0] || session?.user.email.split("@")[0];

  return (
    <PageShell>
      <PageHeader
        icon={CompassIcon}
        title={firstName ? `Hi, ${firstName}` : "Your space"}
        subtitle="Your Xplorers family space. Bookings and classes will live here."
      />
      <SectionCard title="Coming soon">
        <EmptyState
          icon={CompassIcon}
          message="We're setting up classes, workshops, and family bookings. Your account is ready."
          action={
            <Button asChild>
              <Link href="/whats-on">See what&apos;s on</Link>
            </Button>
          }
        />
      </SectionCard>
    </PageShell>
  );
}
