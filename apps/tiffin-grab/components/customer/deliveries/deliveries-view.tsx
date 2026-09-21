"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Card, DateStrip, Notice, Toast, type DeliveryStatus, type StripDay } from "@/components/customer/kit";
import { FONT } from "@/components/customer/kit/cn";
import { actionAvailability, buildDayStatusMap, humanDate, type Trip, type TripAction } from "@/lib/deliveries-view";
import type { Subscription } from "@/lib/services/customer-deliveries.service";
import { actionModel } from "./action-model";
import { TripActions } from "./action-panel";
import { ActionSheet } from "./actions/registry";
import { VacationSheet } from "./actions/vacation-sheet";
import { renewDays, type PlanView } from "./adapter";
import { PlanHeader } from "./plan-header";
import { TripCard, TripRow, tiffins } from "./trip-parts";

const DOT: Record<string, DeliveryStatus> = { delivered: "delivered", upcoming: "upcoming", vacation: "vacation", onHold: "hold" };
const ACTIONS: TripAction[] = ["pick", "swap", "hold", "resume", "move", "vacation", "makeup", "pool"];
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
  initialAction?: string | null;
}

/** Plain list of trips. A merged-source day is folded into its target's "Covers" line, so it never gets a row. */
function TripList({ trips, today, tz, selected, onSelect, limit, allowEarlier }: { trips: Trip[]; today: string; tz: string; selected: string; onSelect: (d: string) => void; limit: number; allowEarlier: boolean }) {
  const [earlier, setEarlier] = useState(false);
  const [more, setMore] = useState(false);
  const rows = trips.filter((t) => t.status !== "combined-into");
  const past = rows.filter((t) => t.date < today);
  const shown = (earlier ? rows : rows.filter((t) => t.date >= today)).filter((_, i) => more || i < limit + (earlier ? past.length : 0));
  const total = rows.filter((t) => t.date >= today).length;
  const link = "min-h-11 px-3 text-sm font-semibold text-[var(--muted-foreground,#6E6558)] underline underline-offset-4 [touch-action:manipulation]";
  return (
    <div>
      {allowEarlier && past.length > 0 && <button type="button" className={link} onClick={() => setEarlier((v) => !v)}>{earlier ? "Hide earlier" : "Show earlier"}</button>}
      <div className="space-y-0.5">
        {shown.map((t) => <TripRow key={t.date} trip={t} tz={tz} selected={t.date === selected} onSelect={onSelect} />)}
      </div>
      {total > limit && <button type="button" className={link} onClick={() => setMore((v) => !v)}>{more ? "Show fewer" : allowEarlier ? "Show more" : "See all"}</button>}
    </div>
  );
}

export function DeliveriesView({ plan, subs, trips, now, monthKey, initialTrip, initialAction }: Props) {
  const router = useRouter();
  const resolve = useCallback((t: Trip | undefined) => (t?.mergedInto ? trips.find((x) => x.date === t.mergedInto) ?? t : t), [trips]);
  const [selected, setSelected] = useState(() => resolve(trips.find((t) => t.date === initialTrip))?.date ?? initialTrip);
  const [active, setActive] = useState<TripAction | null>(() => ACTIONS.find((a) => a === initialAction) ?? null);
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
  const tripFor = (iso: string) => resolve(trips.find((t) => t.date === iso)) ?? trips.find((t) => t.coversDates.includes(iso));

  const qs = (over: Record<string, string | null>) => {
    const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    for (const [k, v] of Object.entries(over)) (v === null ? p.delete(k) : p.set(k, v));
    const s = p.toString();
    return s ? `?${s}` : "?";
  };
  const select = (date: string) => {
    setSelected(resolve(trips.find((t) => t.date === date))?.date ?? date);
    window.history.replaceState(null, "", qs({ trip: date, action: null }));
    if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const pickDay = (iso: string) => {
    const t = tripFor(iso);
    if (t) select(t.date);
    else setToast(`No delivery on ${humanDate(iso)}`);
  };

  const floor = today.slice(0, 7);
  const monthHref = (m: string) => `${qs({ month: m, trip: null, action: null })}`;
  const model = trip ? actionModel(trip, now, ctx) : null;
  const vacAv = trip ? actionAvailability(trip, now, ctx).vacation : null;
  const stripDays: StripDay[] = trip ? weekOf(trip.date).map((iso) => ({ date: iso, status: statusOf(iso) })) : [];
  const closeToast = useCallback(() => setToast(null), []);
  const changed = (message: string) => (setToast(message), router.refresh());
  const done = (message?: string) => {
    setActive(null);
    if (message) changed(message);
  };

  const monthNav = (
    <div className="flex items-center justify-between">
      <h3 className="text-base font-bold tracking-[-0.02em]">{monthLabel(monthKey)}</h3>
      <div className="flex gap-1">
        {monthKey > floor ? (
          <Link href={monthHref(shiftMonth(monthKey, -1))} aria-label="Previous month" className="grid size-11 place-items-center rounded-full hover:bg-[var(--muted)]"><ChevronLeft aria-hidden className="size-5" /></Link>
        ) : null}
        <Link href={monthHref(shiftMonth(monthKey, 1))} aria-label="Next month" className="grid size-11 place-items-center rounded-full hover:bg-[var(--muted)]"><ChevronRight aria-hidden className="size-5" /></Link>
      </div>
    </div>
  );
  const linkCls = "text-sm font-semibold text-[var(--muted-foreground,#6E6558)] underline underline-offset-4 [touch-action:manipulation]";
  const monthLinks = (
    <div className="mt-2 flex flex-wrap gap-x-4 px-3">
      {monthKey > floor && <Link href={monthHref(shiftMonth(monthKey, -1))} className={`${linkCls} inline-flex min-h-11 items-center`}>Back to {monthLabel(shiftMonth(monthKey, -1)).split(" ")[0]}</Link>}
      <Link href={monthHref(shiftMonth(monthKey, 1))} className={`${linkCls} inline-flex min-h-11 items-center`}>{monthLabel(shiftMonth(monthKey, 1)).split(" ")[0]} trips</Link>
    </div>
  );

  return (
    <div className={`${FONT} pb-[190px] lg:pb-8`}>
      <PlanHeader
        sub={sub}
        subs={subs}
        counts={plan.counts}
        renew={renewDays(plan.counts.lastDeliveryDate, today)}
        onVacation={!!ctx.onVacation}
        onVacationClick={() => setActive("vacation")}
        subHref={(id) => `${qs({ sub: id, trip: null, month: null, action: null })}`}
      />

      {ctx.pooled >= 1 && trip && (
        <Notice className="mb-4 items-center justify-between">
          <span>{tiffins(ctx.pooled)} {ctx.pooled === 1 ? "is" : "are"} waiting.</span>
          <button type="button" aria-label="Schedule a make-up" onClick={() => setActive("makeup")} className="min-h-11 shrink-0 px-2 text-sm font-semibold underline underline-offset-4 [touch-action:manipulation]">Make-up<span className="hidden lg:inline"> day</span></button>
        </Notice>
      )}

      {trips.length === 0 || !trip || !model ? (
        <Card className="space-y-2 p-6">
          {monthNav}
          <p className="text-[15px] font-semibold">No deliveries in {monthLabel(monthKey).split(" ")[0]}.</p>
          <p className="text-sm text-[var(--muted-foreground,#6E6558)]">Use the arrows to look at another month.</p>
        </Card>
      ) : (
        <>
          <div className="mb-4 lg:hidden">
            <DateStrip fit label="This week" days={stripDays} value={trip.coversDates.find((c) => stripDays.some((s) => s.date === c)) ?? trip.date} onChange={pickDay} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:items-start lg:gap-8">
            <div className="hidden lg:block">
              <TripList trips={trips} today={today} tz={tz} selected={trip.date} onSelect={select} limit={8} allowEarlier />
              {monthLinks}
            </div>

            <div className="min-w-0 space-y-4">
              <TripCard trip={trip} tz={tz} reason={trip.status === "upcoming" ? null : model.closedReason ?? model.av.pick.why}>
                <div className="mt-6 hidden lg:block">
                  <TripActions model={model} layout="card" onAction={setActive} onGoTo={select} />
                  <div className="mt-4">
                    {ctx.onVacation ? (
                      <button type="button" className={linkCls} onClick={() => setActive("vacation")}>On vacation · Resume deliveries</button>
                    ) : vacAv?.ok === false ? (
                      <p className="text-sm text-[var(--muted-foreground,#6E6558)]">{vacAv.why}</p>
                    ) : (
                      <button type="button" className={linkCls} onClick={() => setActive("vacation")}>Going away? Vacation</button>
                    )}
                  </div>
                </div>
              </TripCard>
              {trips.every((t) => t.status === "hold") && <Notice>Everything is on hold. Resume a trip or schedule a make-up.</Notice>}
            </div>
          </div>

          <section className="mt-6 lg:hidden" aria-label="Upcoming trips">
            <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted-foreground,#6E6558)]">Upcoming</h3>
            <TripList trips={trips} today={today} tz={tz} selected={trip.date} onSelect={select} limit={3} allowEarlier={false} />
            {monthLinks}
          </section>

          {(model.rows.length > 0 || model.goTo || model.primary === "vacation") && <div className={`${FONT} fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-30 border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_92%,transparent)] px-4 py-2 backdrop-blur-xl lg:hidden`}>
            <TripActions model={model} layout="bar" onAction={setActive} onGoTo={select} />
          </div>}
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
