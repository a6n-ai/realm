import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { LifeBuoyIcon, PlusIcon } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { ticketsService } from "@/lib/services/tickets.service";
import { Button } from "@realm/ui/button";
import { PageShell, PageHeader } from "@/components/ds";
import { TicketsList, TicketsListSkeleton } from "./tickets-list";

export default function SupportPage() {
  return (
    <PageShell>
      <PageHeader
        icon={LifeBuoyIcon}
        title="Support"
        subtitle="Questions or something not right? Raise a ticket and we'll help."
        actions={
          <Button asChild>
            <Link href="/dashboard/support/new">
              <PlusIcon className="size-4" />
              New ticket
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<TicketsListSkeleton />}>
        <TicketsData />
      </Suspense>
    </PageShell>
  );
}

async function TicketsData() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const [{ timezone }, [me]] = await Promise.all([
    getAppSettings(),
    db.select({ id: users.id }).from(users).where(eq(users.publicId, session.user.id)).limit(1),
  ]);
  const tickets = me ? await ticketsService.listForCustomer(me.id) : [];

  return <TicketsList tickets={tickets} timezone={timezone} />;
}
