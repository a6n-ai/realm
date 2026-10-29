import Link from "next/link";
import { CalendarDaysIcon } from "lucide-react";
import { EmptyState, PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { getSession } from "@/lib/auth/session";
import { bookingsService } from "@/lib/services/bookings.service";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { ClassCard } from "@/components/marketing/class-card";
import { loadPublicClasses } from "@/lib/sessions/public";
import { BookingRow } from "@/components/customer/classes/booking-row";

export default async function MyClassesPage({ searchParams }: { searchParams: Promise<{ booked?: string }> }) {
  const { booked } = await searchParams;
  const session = await getSession();
  const [bookings, timeZone, classes] = await Promise.all([
    session?.user ? bookingsService.listForUser(session.user.id) : Promise.resolve([]),
    studioSessionsService.timezone(),
    loadPublicClasses().then((all) => all.filter((c) => c.bookingType === "bookable")),
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
            <Link href="/me/book">Book a class</Link>
          </Button>
        }
      />

      {booked ? (
        <p role="status" className="bg-secondary text-secondary-foreground rounded-2xl p-4 text-sm font-medium">
          You&apos;re booked in. See you there!
        </p>
      ) : null}

      <SectionCard title="Upcoming">
        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarDaysIcon}
            message="No upcoming classes. Pick one below to book."
            action={
              <Button asChild>
                <Link href="/me/book">Book a class</Link>
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

      {classes.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="book-a-class">
          <h2 id="book-a-class" className="text-base font-semibold">
            Book a class
          </h2>
          <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((c) => (
              <ClassCard key={c.publicId} item={c} href={`/me/book?class=${c.publicId}`} />
            ))}
          </div>
        </section>
      ) : null}

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
