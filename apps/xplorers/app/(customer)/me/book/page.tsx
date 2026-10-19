import Link from "next/link";
import { ValidationError } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { SessionsCalendar } from "@/components/calendar/sessions-calendar";
import { BookHeader } from "@/components/customer/book/book-header";
import { BookingWizard } from "@/components/customer/book/booking-wizard";
import { ClassCard } from "@/components/marketing/class-card";
import { offeredLengths, startTimes } from "@/lib/pricing/resolve";
import { getAppClock, getDefaultPrices } from "@/lib/services/app-settings.service";
import { childrenService } from "@/lib/services/children.service";
import { paymentsService } from "@/lib/services/payments.service";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";
import { walletService } from "@/lib/services/wallet.service";
import { monthGrid } from "@/lib/sessions/calendar";
import { isRealDay, MAX_RANGE_DAYS, parseRange, toCalendarSessions } from "@/lib/sessions/calendar-events";
import { formatSessionDay, formatSessionTime } from "@/lib/sessions/format";
import { loadPublicClasses } from "@/lib/sessions/public";
import { addDayKey, dayKey } from "@/lib/sessions/timezone";

type Params = Promise<Record<string, string | undefined>>;

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <BookHeader step={1} back="/me/classes" />
      <div className="bg-card flex flex-col gap-3 rounded-2xl border p-5">
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="text-muted-foreground text-sm">{children}</div>
        <Button asChild className="h-11">
          <Link href="/me/book">See classes</Link>
        </Button>
      </div>
    </div>
  );
}

export default async function BookPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const { timezone: timeZone, currency } = await getAppClock();

  if (sp.session) {
    const occ = await studioSessionsService.getPublished(sp.session).catch((err) => {
      if (err instanceof ValidationError) return null;
      throw err;
    });
    if (!occ) return <Notice title="This session isn't open for booking">It may be full, finished or cancelled. Pick another day.</Notice>;
    if (occ.bookingType !== "bookable") {
      return (
        <Notice title="This class is by enquiry only">
          <Link href={`/contact?class=${encodeURIComponent(occ.title)}`} className="underline">Get in touch</Link> and we&apos;ll arrange it.
        </Notice>
      );
    }
    const windowMinutes = (occ.endsAt.getTime() - occ.startsAt.getTime()) / 60_000;
    const lengths = offeredLengths(occ.pricing, await getDefaultPrices(), windowMinutes);
    if (lengths.length === 0) {
      return <Notice title="Online booking isn't available for this session">Prices for it aren&apos;t set yet. Ask us and we&apos;ll help.</Notice>;
    }
    const [kids, rails, rate] = await Promise.all([childrenService.listMine(), paymentsService.enabledRails(), walletService.walletRate()]);
    const pricing = occ.pricing;
    return (
      <BookingWizard
        key={occ.occurrencePublicId}
        session={{
          occurrencePublicId: occ.occurrencePublicId,
          classPublicId: occ.publicId,
          title: occ.title,
          occursOn: occ.occursOn,
          startsAt: occ.startsAt.toISOString(),
          endsAt: occ.endsAt.toISOString(),
          dayLabel: formatSessionDay(occ.startsAt, timeZone),
          remaining: occ.remaining,
          ageMin: occ.ageMin,
          ageMax: occ.ageMax,
          ageWaiver: occ.ageWaiver,
        }}
        options={{
          mode: pricing.mode,
          lengths,
          options: pricing.options,
          extension: pricing.extension ? { stepMinutes: pricing.extension.stepMinutes } : null,
          adultsFree: pricing.adults.free,
          extraAdults: pricing.adults.extraPrice !== null,
          startTimes: startTimes(occ.startsAt, occ.endsAt, lengths[0]!).map((d) => d.toISOString()),
        }}
        initialChildren={kids.map((k) => ({ publicId: k.publicId, name: k.name, dateOfBirth: k.dateOfBirth }))}
        timeZone={timeZone}
        currency={currency}
        rails={rails.map((r) => ({ id: r.id, label: r.label }))}
        coinsAvailable={rate !== null}
        backHref={`/me/book?class=${occ.publicId}`}
      />
    );
  }

  const classes = (await loadPublicClasses()).filter((c) => c.bookingType === "bookable");
  const picked = classes.find((c) => c.publicId === sp.class);

  if (!picked) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <BookHeader step={1} back="/me/classes" />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">Pick a class</h1>
        {classes.length === 0 ? (
          <p className="text-muted-foreground text-sm">No classes are open for booking right now. Check back soon.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {classes.map((c) => (
              <ClassCard key={c.publicId} item={c} href={`/me/book?class=${c.publicId}`} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const today = dayKey(new Date(), timeZone);
  const grid = monthGrid(today.slice(0, 7));
  const { from, to } = parseRange(sp.from, sp.to, { from: grid[0]!.date, to: grid[grid.length - 1]!.date });
  const now = new Date().getTime();
  const mine = (r: { classPublicId: string; startsAt: Date }) => r.classPublicId === picked.publicId && r.startsAt.getTime() > now;
  const [rows, upcoming] = await Promise.all([
    studioSessionsService.listRange(from, to, { publicOnly: true }).then((r) => r.filter(mine)),
    // The phone list is not tied to the calendar's range, so it can always reach the next dates.
    studioSessionsService.listRange(today, addDayKey(today, MAX_RANGE_DAYS), { publicOnly: true }).then((r) => r.filter(mine)),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <BookHeader step={2} back="/me/book" />
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">{picked.title}</h1>
        <p className="text-muted-foreground text-sm">Pick a day to book.</p>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {upcoming.length === 0 ? <li className="text-muted-foreground text-sm">No open dates coming up.</li> : null}
        {upcoming.map((r) => (
          <li key={r.publicId}>
            <Link
              href={`/me/book?session=${r.publicId}`}
              className="bg-card flex min-h-14 items-center justify-between gap-3 rounded-2xl border p-3 transition-colors active:bg-secondary"
            >
              <span className="font-medium">
                {formatSessionDay(r.startsAt, timeZone)} · {formatSessionTime(r.startsAt, timeZone)}
              </span>
              <span className="text-muted-foreground text-sm">{r.remaining > 0 ? `${r.remaining} left` : "Full"}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <SessionsCalendar
          sessions={toCalendarSessions(rows)}
          defaultView="week"
          defaultDate={isRealDay(sp.date) ? sp.date : today}
          timeZone={timeZone}
          from={from}
          to={to}
          target="book"
        />
      </div>
    </div>
  );
}
