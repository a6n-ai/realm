"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Card, DateStrip, MonthGrid, Notice, StatusDot, Toast, type DeliveryStatus, type StripDay } from "@/components/customer/kit";
import { FONT } from "@/components/customer/kit/cn";
import { actionAvailability, buildDayStatusMap, humanDate, type Trip, type TripAction } from "@/lib/deliveries-view";
import type { Subscription } from "@/lib/services/customer-deliveries.service";
import { actionModel } from "./action-model";
import { ActionBar, ActionRail } from "./action-panel";
import { ActionSheet } from "./actions/registry";
import { VacationSheet } from "./actions/vacation-sheet";
import { renewDays, type PlanView } from "./adapter";
import { PlanHeader } from "./plan-header";
import { TripDetail, TripRow, tiffins } from "./trip-parts";

const LEGEND: { key: DeliveryStatus; label: string }[] = [
  { key: "delivered", label: "Delivered" },
  { key: "upcoming", label: "Upcoming" },
  { key: "vacation", label: "Vacation" },
  { key: "hold", label: "On hold" },
];
const DOT: Record<string, DeliveryStatus> = { delivered: "delivered", upcoming: "upcoming", vacation: "vacation", onHold: "hold" };
const MONTH = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
const monthLabel = (m: string) => MONTH.format(new Date(`${m}-01T00:00:00Z`));
const shiftMonth = (m: string, n: number) => {
  const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const weekOf = (iso: string) => {
  const mon = addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
};

interface Props {
  plan: PlanView;
  subs: Subscription[];
  trips: Trip[];
  now: number;
  monthKey: string;
  initialTrip: string | null;
}

export function DeliveriesView({ plan, subs, trips, now, monthKey, initialTrip }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState(initialTrip);
  const [active, setActive] = useState<TripAction | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { ctx, today, sub } = plan;
  const tz = ctx.timezone;

  const trip = trips.find((t) => t.date === selected) ?? null;
  const byDate = useMemo(() => buildDayStatusMap(trips), [trips]);
  const statusOf = (iso: string): DeliveryStatus | undefined => {
    const e = byDate[iso];
    if (!e) return undefined;
    return e.legend ? DOT[e.legend] : "combined";
  };
  const tripFor = (iso: string) => trips.find((t) => t.date === iso || t.coversDates.includes(iso));

  const qs = (over: Record<string, string | null>) => {
    const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    for (const [k, v] of Object.entries(over)) (v === null ? p.delete(k) : p.set(k, v));
    const s = p.toString();
    return s ? `?${s}` : "?";
  };
  const select = (date: string) => {
    setSelected(date);
    window.history.replaceState(null, "", qs({ trip: date }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const pickDay = (iso: string) => {
    const t = tripFor(iso);
    if (t) select(t.date);
    else setToast(`No delivery on ${humanDate(iso)}`);
  };

  const floor = today.slice(0, 7);
  const monthHref = (m: string) => `${qs({ month: m, trip: null })}`;
  const model = trip ? actionModel(trip, now, ctx) : null;
  const vacAv = trip ? actionAvailability(trip, now, ctx).vacation : null;
  const vacation = ctx.onVacation
    ? { label: "On vacation · Resume", sub: "Bring paused trips back", reason: undefined }
    : { label: "Going away? Vacation", sub: vacAv?.ok === false ? "" : "Pause every trip for a date range", reason: vacAv?.ok === false ? (vacAv.why ?? undefined) : undefined };

  const stripDays: StripDay[] = trip ? weekOf(trip.date).map((iso) => ({ date: iso, status: statusOf(iso) })) : [];
  const closeToast = useCallback(() => setToast(null), []);
  const changed = (message: string) => (setToast(message), router.refresh());
  const done = (message?: string) => {
    setActive(null);
    if (message) changed(message);
  };

  const monthNav = (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-base font-bold tracking-[-0.02em]">{monthLabel(monthKey)}</h3>
      <div className="flex gap-1">
        {monthKey > floor ? (
          <Link href={monthHref(shiftMonth(monthKey, -1))} aria-label="Previous month" className="grid size-11 place-items-center rounded-full hover:bg-[var(--muted)]"><ChevronLeft aria-hidden className="size-5" /></Link>
        ) : null}
        <Link href={monthHref(shiftMonth(monthKey, 1))} aria-label="Next month" className="grid size-11 place-items-center rounded-full hover:bg-[var(--muted)]"><ChevronRight aria-hidden className="size-5" /></Link>
      </div>
    </div>
  );

  return (
    <div className={`${FONT} pb-[240px] md:pb-32 lg:pb-8`}>
      <PlanHeader
        sub={sub}
        subs={subs}
        counts={plan.counts}
        renew={renewDays(plan.counts.lastDeliveryDate, today)}
        cutoffHour={ctx.cutoffHour}
        onVacation={!!ctx.onVacation}
        onVacationClick={() => setActive("vacation")}
        subHref={(id) => `${qs({ sub: id, trip: null, month: null })}`}
      />

      {ctx.pooled >= 1 && trip && (
        <Card className="mb-4 flex items-center justify-between gap-3 border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)]/40 px-4 py-3 md:px-5 md:py-4">
          <p className="text-[15px] font-semibold">{tiffins(ctx.pooled)} {ctx.pooled === 1 ? "is" : "are"} waiting<span className="hidden font-normal text-[var(--muted-foreground,#6E6558)] md:inline">. Add them after your last delivery.</span></p>
          <button type="button" aria-label="Schedule a make-up" onClick={() => setActive("makeup")} className="min-h-11 shrink-0 rounded-full border-[1.5px] border-[var(--foreground)] px-4 text-[15px] font-semibold [touch-action:manipulation] md:px-5">Make-up<span className="hidden md:inline"> day</span></button>
        </Card>
      )}

      {trips.length === 0 || !trip || !model ? (
        <Card className="p-6">
          {monthNav}
          <p className="text-[15px] font-semibold">No deliveries in {monthLabel(monthKey).split(" ")[0]}.</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground,#6E6558)]">Use the arrows to look at another month.</p>
        </Card>
      ) : (
        <>
          <div className="mb-4 md:hidden">
            <DateStrip fit label="This week" days={stripDays} value={trip.coversDates.find((c) => stripDays.some((s) => s.date === c)) ?? trip.date} onChange={pickDay} />
          </div>

          <div className="grid gap-6 md:grid-cols-[300px_1fr] lg:grid-cols-[320px_minmax(0,1fr)_340px]">
            <Card className="hidden self-start p-4 md:block">
              <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--primary)]">Timeline</h3>
              <div className="space-y-1">
                {trips.map((t) => <TripRow key={t.date} trip={t} tz={tz} selected={t.date === trip.date} onSelect={select} />)}
              </div>
            </Card>

            <div className="min-w-0 space-y-6">
              <TripDetail trip={trip} tz={tz} />
              <section className="md:hidden" aria-label="Trips">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--primary)]">Trips</h3>
                <Card className="space-y-1 p-2">
                  {trips.map((t) => <TripRow key={t.date} trip={t} tz={tz} selected={t.date === trip.date} onSelect={select} />)}
                </Card>
              </section>
              {trips.every((t) => t.status === "hold") && <Notice>Everything is on hold. Resume a trip or schedule a make-up.</Notice>}
            </div>

            <div className="hidden space-y-6 self-start lg:block">
              <Card className="p-4">
                <h3 className="mb-3 px-1 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--primary)]">Actions for {humanDate(trip.date)}</h3>
                <ActionRail model={model} onAction={setActive} onGoTo={select} vacation={vacation} />
              </Card>
              <Card className="p-4">
                {monthNav}
                <MonthGrid
                  month={monthKey}
                  selected={trip.coversDates.find((c) => c.startsWith(monthKey)) ?? null}
                  days={Object.fromEntries(Object.keys(byDate).map((k) => [k, { status: statusOf(k) }]))}
                  onSelect={pickDay}
                />
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground,#6E6558)]">
                  {LEGEND.map((l) => <li key={l.key} className="flex items-center gap-1.5"><StatusDot decorative status={l.key} />{l.label}</li>)}
                </ul>
              </Card>
            </div>
          </div>

          <ActionBar model={model} trip={trip} tz={tz} onAction={setActive} onGoTo={select} />
        </>
      )}

      {active === "vacation" ? (
        <VacationSheet plan={plan} open onDone={done} />
      ) : (
        active && trip && <ActionSheet action={active} trip={trip} plan={plan} open onDone={done} onChanged={changed} />
      )}
      <Toast open={toast !== null} onClose={closeToast}>{toast}</Toast>
    </div>
  );
}
