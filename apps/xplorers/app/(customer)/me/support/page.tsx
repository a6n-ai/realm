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

type SearchParams = Promise<{ bookingId?: string; ticket?: string }>;

export default function SupportPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <Suspense
        fallback={
          <PageHeader icon={LifeBuoyIcon} title="Support" subtitle="Raise a ticket and we'll help." />
        }
      >
        <SupportHeader searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<TicketsListSkeleton />}>
        <TicketsData />
      </Suspense>
    </PageShell>
  );
}

async function SupportHeader({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me/support");

  const { bookingId } = await searchParams;
  const [bookings, { timezone }] = await Promise.all([
    bookingsService.listForUser(session.user.id),
    getAppClock(),
  ]);
  const bookingOptions = bookings.map((b) => ({
    value: b.publicId,
    label: `${b.sessionTitle} · ${formatSessionDay(b.startsAt, timezone)}`,
  }));
  const preselected =
    bookingId && bookingOptions.some((o) => o.value === bookingId) ? bookingId : undefined;

  return (
    <PageHeader
      icon={LifeBuoyIcon}
      title="Support"
      subtitle="Raise a ticket and we'll help."
      actions={
        <NewTicketControl
          categories={TICKET_CATEGORIES}
          bookings={bookingOptions}
          defaultBookingId={preselected}
          {...(preselected ? { defaultCategory: "booking" as const } : {})}
        />
      }
    />
  );
}

async function TicketsData() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login?callbackUrl=/me/support");
  const [{ timezone }, tickets] = await Promise.all([
    getAppClock(),
    ticketsService.listForCustomer(userId),
  ]);
  return <TicketsList tickets={tickets} timezone={timezone} />;
}
