import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LifeBuoyIcon } from "lucide-react";
import { PageHeader, PageShell } from "@foundry/design-system";
import { getSession } from "@/lib/auth/session";
import { getAppClock } from "@/lib/services/app-settings.service";
import { bookingsService } from "@/lib/services/bookings.service";
import { currentUserId } from "@/lib/services/session-service";
import { ticketsService } from "@/lib/services/tickets.service";
import { formatSessionDay } from "@/lib/sessions/format";
import { TICKET_CATEGORIES } from "@/lib/support/ticket-taxonomy";
import { NewTicketControl } from "@/components/customer/support/new-ticket-control";
import { TicketsList, TicketsListSkeleton } from "@/components/customer/support/tickets-list";

type SearchParams = Promise<{ bookingId?: string; ticket?: string; category?: string }>;

export default function SupportPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        icon={LifeBuoyIcon}
        title="Support"
        subtitle="Start a chat on a topic, or pick up where you left off."
      />
      <Suspense fallback={<TicketsListSkeleton />}>
        <SupportBody searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function SupportBody({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me/support");
  const userId = await currentUserId();
  if (userId == null) redirect("/login?callbackUrl=/me/support");

  const { bookingId } = await searchParams;
  const [bookings, { timezone }, tickets] = await Promise.all([
    bookingsService.listForUser(session.user.id),
    getAppClock(),
    ticketsService.listForCustomer(userId),
  ]);
  const bookingOptions = bookings.map((b) => ({
    value: b.publicId,
    label: `${b.sessionTitle} · ${formatSessionDay(b.startsAt, timezone)}`,
  }));
  const preselected =
    bookingId && bookingOptions.some((o) => o.value === bookingId) ? bookingId : undefined;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <NewTicketControl
        categories={TICKET_CATEGORIES}
        bookings={bookingOptions}
        defaultBookingId={preselected}
        {...(preselected ? { defaultCategory: "booking" as const } : {})}
      />
      <TicketsList tickets={tickets} timezone={timezone} />
    </div>
  );
}
