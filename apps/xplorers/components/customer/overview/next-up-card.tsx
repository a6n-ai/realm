import Link from "next/link";
import { ArrowRightIcon, CalendarDaysIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { formatSessionDay, formatSessionTime } from "@/lib/sessions/format";
import type { BookingListItem } from "@/components/customer/classes/booking-row";

export function NextUpCard({
  booking,
  timeZone,
}: {
  booking: BookingListItem | null;
  timeZone: string;
}) {
  if (!booking) {
    return (
      <div className="xl-next-up sm:p-6">
        <p className="text-[var(--xl-pink-600)] text-xs font-bold tracking-[0.08em] uppercase">Next up</p>
        <h2 className="mt-2 text-xl font-extrabold tracking-tight sm:text-2xl">Nothing on the calendar yet</h2>
        <p className="text-muted-foreground mt-1.5 max-w-md text-sm leading-relaxed">
          Pick a session and we&apos;ll show it here first — day, time, and a one-tap pay if it&apos;s still pending.
        </p>
        <Button asChild className="mt-4">
          <Link href="/whats-on">
            Find a class
            <ArrowRightIcon className="ml-1.5 size-4" aria-hidden />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("xl-next-up xl-next-up-live sm:p-6")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[var(--xl-pink-600)] text-xs font-bold tracking-[0.08em] uppercase">Next up</p>
          <h2 className="mt-2 truncate text-xl font-extrabold tracking-tight sm:text-2xl">{booking.sessionTitle}</h2>
          <p className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-sm">
            <CalendarDaysIcon className="size-3.5 shrink-0" aria-hidden />
            {formatSessionDay(booking.startsAt, timeZone)} · {formatSessionTime(booking.startsAt, timeZone)} ·{" "}
            {booking.seats} {booking.seats === 1 ? "seat" : "seats"}
          </p>
        </div>
        <span className="bg-card/80 text-[var(--xl-navy-800)] shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold capitalize">
          {booking.status}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href="/me/classes">Open my classes</Link>
        </Button>
        {booking.status === "pending" && booking.paymentPublicId ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/me/pay/${booking.paymentPublicId}`}>Pay now</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
