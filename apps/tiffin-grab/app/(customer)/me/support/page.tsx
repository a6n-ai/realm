import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeftIcon, LifeBuoyIcon, PlusIcon } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { usersService } from "@/lib/services/users.service";
import { ticketsService } from "@/lib/services/tickets.service";
import { Button } from "@realm/ui/button";
import { PageShell, PageHeader } from "@/components/ds";
import { TicketsList, TicketsListSkeleton } from "@/components/customer/support/tickets-list";

export default function SupportPage() {
  return (
    <PageShell>
      <div className="md:hidden">
        <Link
          href="/me/account"
          className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-11 items-center gap-1 text-sm transition-colors"
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
          Account
        </Link>
      </div>

      <PageHeader
        icon={LifeBuoyIcon}
        title="Support"
        subtitle="Questions or something not right? Raise a ticket and we'll help."
        actions={
          <Button asChild className="min-h-11 active:scale-[0.98]">
            <Link href="/me/support/new">
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

  const [{ timezone }, user] = await Promise.all([
    getAppSettings(),
    usersService.read(session.user.id),
  ]);
  const tickets = await ticketsService.listForCustomer(user.id);

  return <TicketsList tickets={tickets} timezone={timezone} />;
}
