import Link from "next/link";
import { CalendarDaysIcon, CoinsIcon, CompassIcon, SparklesIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { getSession } from "@/lib/auth/session";
import { bookingsService } from "@/lib/services/bookings.service";
import { walletService } from "@/lib/services/wallet.service";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { loadPublicSessionCards } from "@/lib/sessions/public";
import { formatSessionDay, formatSessionTime } from "@/lib/sessions/format";
import { BookingRow } from "@/components/customer/classes/booking-row";
import { NextUpCard } from "@/components/customer/overview/next-up-card";
import { PulseStrip } from "@/components/customer/overview/pulse-strip";
import { QuickActions } from "@/components/customer/overview/quick-actions";

const MORE_UPCOMING = 3;
const BOOKABLE_PREVIEW = 4;

export default async function CustomerHomePage() {
  const session = await getSession();
  const firstName = session?.user.name?.split(" ")[0] || session?.user.email.split("@")[0];
  const userId = session?.user?.id;

  const [bookings, timeZone, wallet, publicSessions, bookedIds] = await Promise.all([
    userId ? bookingsService.listForUser(userId) : Promise.resolve([]),
    studioSessionsService.timezone(),
    userId ? walletService.coinsForFamily(userId, 5) : Promise.resolve(null),
    loadPublicSessionCards(),
    userId ? bookingsService.listConfirmedOccurrencePublicIds(userId) : Promise.resolve([]),
  ]);

  const now = Date.now();
  const upcoming = bookings
    .filter((b) => b.startsAt.getTime() >= now && (b.status === "confirmed" || b.status === "pending"))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const attended = bookings.filter((b) => b.status === "confirmed" && b.startsAt.getTime() < now).length;
  const booked = new Set(bookedIds);
  const toBook = publicSessions.cards
    .filter((c) => c.startsAt.getTime() >= now && c.remaining > 0 && !booked.has(c.publicId))
    .slice(0, BOOKABLE_PREVIEW);
  const next = upcoming[0] ?? null;
  const rest = upcoming.slice(1, 1 + MORE_UPCOMING);

  return (
    <PageShell>
      <PageHeader
        icon={CompassIcon}
        title={firstName ? `Hi, ${firstName}` : "Overview"}
        subtitle="Your week — next class, open seats, and shortcuts."
        actions={
          <Button asChild size="sm">
            <Link href="/whats-on">See what&apos;s on</Link>
          </Button>
        }
      />

      <PulseStrip
        items={[
          {
            label: "Upcoming",
            value: upcoming.length,
            hint: upcoming.length === 1 ? "class" : "classes",
            href: "/me/classes",
            tone: "sky",
            icon: CalendarDaysIcon,
          },
          {
            label: "Done",
            value: attended,
            hint: "attended",
            href: "/me/classes",
            tone: "blush",
            icon: SparklesIcon,
          },
          {
            label: "Coins",
            value: wallet ? wallet.balance.toLocaleString() : "—",
            hint: wallet ? `≈ ${wallet.value}` : "wallet",
            href: "/me/wallet",
            tone: "sunshine",
            icon: CoinsIcon,
          },
        ]}
      />

      <QuickActions />

      <NextUpCard booking={next} timeZone={timeZone} />

      {rest.length > 0 ? (
        <SectionCard
          title="Also coming up"
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/me/classes">All classes</Link>
            </Button>
          }
        >
          <ul className="divide-border divide-y">
            {rest.map((booking) => (
              <BookingRow key={booking.publicId} booking={booking} timeZone={timeZone} />
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Open to book"
        subtitle="Seats still free on the next published sessions."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/whats-on">Full calendar</Link>
          </Button>
        }
      >
        {toBook.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing open right now. Check{" "}
            <Link href="/whats-on" className="font-semibold underline underline-offset-2">
              What&apos;s on
            </Link>{" "}
            later.
          </p>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {toBook.map((card) => (
              <li key={card.occurrenceKey}>
                <Link href={`/whats-on?book=${card.publicId}`} className="xl-book-tile">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold tracking-tight">{card.title}</p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {formatSessionDay(card.startsAt, publicSessions.timeZone)} ·{" "}
                      {formatSessionTime(card.startsAt, publicSessions.timeZone)}
                    </p>
                    <p className="text-[var(--xl-navy-800)] mt-2 text-xs font-bold">{card.spots}</p>
                  </div>
                  <span className="bg-primary text-primary-foreground border-border inline-flex h-9 w-fit items-center rounded-[var(--radius)] border px-3 text-sm font-bold">
                    Book
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}
