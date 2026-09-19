import Link from "next/link";
import { CalendarDaysIcon, CompassIcon } from "lucide-react";
import { EmptyState, PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { getSession } from "@/lib/auth/session";
import { bookingsService } from "@/lib/services/bookings.service";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { formatSessionDay, formatSessionTime } from "@/lib/sessions/format";

export default async function CustomerHomePage() {
  const session = await getSession();
  const firstName = session?.user.name?.split(" ")[0] || session?.user.email.split("@")[0];
  const [bookings, timeZone] = await Promise.all([
    session?.user ? bookingsService.listForUser(session.user.id) : Promise.resolve([]),
    studioSessionsService.timezone(),
  ]);

  return (
    <PageShell>
      <PageHeader
        icon={CompassIcon}
        title={firstName ? `Hi, ${firstName}` : "Your space"}
        subtitle="Your family's bookings live here."
        actions={
          <Button asChild size="sm">
            <Link href="/whats-on">See what's on</Link>
          </Button>
        }
      />
      <SectionCard title="Bookings">
        {bookings.length === 0 ? (
          <EmptyState
            icon={CalendarDaysIcon}
            message="No bookings yet. Pick a class day on the public calendar."
            action={
              <Button asChild>
                <Link href="/whats-on">Book a session</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-border divide-y">
            {bookings.map((booking) => (
              <li key={booking.publicId} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{booking.sessionTitle}</p>
                  <p className="text-muted-foreground text-sm">
                    {formatSessionDay(booking.startsAt, timeZone)} · {formatSessionTime(booking.startsAt, timeZone)} ·{" "}
                    {booking.seats} {booking.seats === 1 ? "seat" : "seats"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={booking.status === "confirmed" ? "default" : "outline"}>{booking.status}</Badge>
                  {booking.status === "pending" && booking.paymentPublicId ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/me/pay/${booking.paymentPublicId}`}>Pay</Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}
