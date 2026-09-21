import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { usersService } from "@/lib/services/users.service";
import { ticketsService } from "@/lib/services/tickets.service";
import { PageHeader } from "@/components/customer/kit";
import { BackLink, LinkButton } from "@/components/customer/support/parts";
import { TicketsList, TicketsListSkeleton } from "@/components/customer/support/tickets-list";

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href="/me/account" label="Account" />
      <PageHeader
        eyebrow="Support"
        title="How can we"
        accent="help?"
        subtitle="Raise a ticket and we'll help."
        action={
          <LinkButton href="/me/support/new">
            <PlusIcon aria-hidden className="size-4" />
            New ticket
          </LinkButton>
        }
      />
      <Suspense fallback={<TicketsListSkeleton />}>
        <TicketsData />
      </Suspense>
    </div>
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
