import Link from "next/link";
import { CalendarDaysIcon } from "lucide-react";
import { EmptyState, PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { getSession } from "@/lib/auth/session";
import { bookingsService } from "@/lib/services/bookings.service";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { BookingRow } from "@/components/customer/classes/booking-row";

export default async function MyClassesPage() {
  const session = await getSession();
  const [bookings, timeZone] = await Promise.all([
    session?.user ? bookingsService.listForUser(session.user.id) : Promise.resolve([]),
    studioSessionsService.timezone(),
  ]);

  const now = Date.now();
  const upcoming = bookings
    .filter((b) => b.startsAt.getTime() >= now && (b.status === "confirmed" || b.status === "pending"))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = bookings
    .filter((b) => b.startsAt.getTime() < now || (b.status !== "confirmed" && b.status !== "pending"))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

  return (
    <PageShell>
      <PageHeader
        icon={CalendarDaysIcon}
        title="My classes"
        subtitle="Upcoming sessions and your class history."
        actions={
          <Button asChild size="sm">
            <Link href="/whats-on">Book a class</Link>
          </Button>
        }
      />

      <SectionCard title="Upcoming">
        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarDaysIcon}
            message="No upcoming classes. Pick a day on What's on."
            action={
              <Button asChild>
                <Link href="/whats-on">See what&apos;s on</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-border divide-y">
            {upcoming.map((booking) => (
              <BookingRow key={booking.publicId} booking={booking} timeZone={timeZone} />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Past">
        {past.length === 0 ? (
          <p className="text-muted-foreground text-sm">No past classes yet.</p>
        ) : (
          <ul className="divide-border divide-y">
            {past.map((booking) => (
              <BookingRow key={booking.publicId} booking={booking} timeZone={timeZone} />
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}
