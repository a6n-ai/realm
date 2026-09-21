"use client";
import { Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Button, Card, Notice, Toast, type DeliveryStatus } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { actionAvailability, formatCutoff, humanDate, type Trip, type TripAction } from "@/lib/deliveries-view";
import { buildEatingDays, deliveryLine, weekdayShort, type EatingRow } from "@/lib/deliveries-view/eating";
import { addDays, dotStatus, mondayOf, PLAN_COLORS, type Agenda } from "@/lib/deliveries-view/week";
import type { Subscription, SubscriptionWindow } from "@/lib/services/customer-deliveries.service";
import { actionModel } from "./action-model";
import { TripActions } from "./action-panel";
import { ActionSheet } from "./actions/registry";
import { VacationSheet } from "./actions/vacation-sheet";
import { renewDays, type PlanView } from "./adapter";
import { PlanHeader, windowLabel } from "./plan-header";
import { EatingCard, EatingRowButton, InfoButton, TripInfoSheet, tiffins } from "./trip-parts";
import { WeekStrip } from "./week-strip";

const ACTIONS: TripAction[] = ["pick", "swap", "hold", "resume", "move", "vacation", "makeup", "pool"];
const WEEK = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const weekTitle = (m: string) => `${WEEK.format(new Date(`${m}T00:00:00Z`))} – ${WEEK.format(new Date(`${addDays(m, 6)}T00:00:00Z`))}`;

interface Props {
  /** The ONE plan on screen; switching plans reloads the page for the other plan. */
  plan: PlanView;
  /** All the customer's plans, ordered by start date, for the tabs on top. */
  subs: Subscription[];
  windows: Record<string, SubscriptionWindow>;
  /** Trips of the selected week for this plan. */
  trips: Trip[];
  /** Eating-day agenda of this plan across the whole range. */
  agenda: Agenda;
  weekStart: string;
  firstWeek: string;
  lastWeek: string;
  now: number;
  initialTrip: string | null;
  initialAction?: string | null;
}

function PlanTab({ selected, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return <button type="button" aria-pressed={selected} {...rest} className={cn(FOCUS, "flex min-h-11 shrink-0 flex-col justify-center rounded-2xl border-[1.5px] px-4 py-1.5 text-left [touch-action:manipulation]", selected ? "border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)]" : "border-[var(--border)] bg-[var(--card,#fff)]", className)} />;
}
const rank = (t: Trip) => (t.status === "upcoming" ? 0 : t.status === "hold" ? 1 : 2);

export function DeliveriesView({ plan, subs, windows, trips, agenda, weekStart, firstWeek, lastWeek, now, initialTrip, initialAction }: Props) {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const multi = subs.length > 1;
  const color = PLAN_COLORS[Math.max(subs.findIndex((s) => s.publicId === plan.orderId), 0) % PLAN_COLORS.length]!;

  const [sel, setSel] = useState<string | null>(initialTrip);
  const [wk, setWk] = useState(weekStart);
  if (wk !== weekStart) {
    setWk(weekStart);
    setSel(initialTrip);
  }
  const [active, setActive] = useState<TripAction | null>(() => ACTIONS.find((a) => a === initialAction) ?? null);
  const [info, setInfo] = useState<EatingRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { ctx, sub, today } = plan;
  const tz = ctx.timezone;
  const weekEnd = addDays(weekStart, 6);

  const shown = useMemo(() => buildEatingDays(trips).filter((r) => r.date >= weekStart && r.date <= weekEnd), [trips, weekStart, weekEnd]);
  const inWeek = !!sel && sel >= weekStart && sel <= weekEnd;
  const row: EatingRow | null = (sel ? shown.find((r) => r.date === sel) : null) ?? (inWeek ? null : [...shown].sort((a, b) => rank(a.trip) - rank(b.trip) || a.date.localeCompare(b.date))[0] ?? null);
  const trip = row?.trip ?? null;
  const emptyDay = !row && inWeek ? sel : null;
  const model = trip ? actionModel(trip, now, ctx) : null;
  const vacAv = trip ? actionAvailability(trip, now, ctx).vacation : null;

  const dots = useMemo(() => {
    const out: Record<string, { orderId: string; status: DeliveryStatus; truck: boolean }[]> = {};
    for (const [date, ds] of Object.entries(agenda)) out[date] = ds.map((d) => ({ orderId: d.orderId, status: dotStatus(d, now), truck: d.truck }));
    return out;
  }, [agenda, now]);

  const qs = (over: Record<string, string | null>) => {
    const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    for (const [k, v] of Object.entries(over)) (v === null ? p.delete(k) : p.set(k, v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const goWeek = (monday: string, over: Record<string, string | null> = {}) =>
    startNav(() => router.replace(`/me${qs({ week: monday, trip: null, action: null, ...over })}`, { scroll: false }));
  const select = (date: string) => {
    setSel(date);
    window.history.replaceState(null, "", qs({ trip: date, action: null }));
    if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goTo = (date: string) => {
    const mon = mondayOf(date);
    if (mon === weekStart) return select(date);
    setSel(date);
    goWeek(mon, { trip: date });
  };
  const pickDay = (iso: string) => (mondayOf(iso) === weekStart ? select(iso) : goTo(iso));
  const switchPlan = (id: string) => startNav(() => router.replace(`/me?sub=${id}`, { scroll: false }));

  const closeToast = useCallback(() => setToast(null), []);
  const changed = (message: string) => (setToast(message), router.refresh());
  const done = (message?: string) => {
    setActive(null);
    if (message) changed(message);
  };
  const linkCls = "text-sm font-semibold text-[var(--muted-foreground,#6E6558)] underline underline-offset-4 [touch-action:manipulation]";

  const dates = Object.keys(agenda).sort();
  const next = dates.find((d) => d > weekEnd) ?? [...dates].reverse().find((d) => d < weekStart) ?? null;
  const upcoming = Object.values(agenda).flat().filter((d) => d.truck && d.status === "scheduled" && d.deliveryDate >= today).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))[0];
  const hasBar = !!(trip && model && (model.rows.length > 0 || model.goTo || model.primary === "vacation"));
  const heldOnly = shown.length > 0 && shown.every((r) => r.trip.status === "hold");

  return (
    <div className={`${FONT} ${hasBar ? "pb-[190px]" : "pb-8"} lg:pb-8`}>
      <PlanHeader
        sub={sub}
        counts={plan.counts}
        renew={renewDays(plan.counts.lastDeliveryDate, today)}
        onVacation={!!ctx.onVacation}
        onVacationClick={() => setActive("vacation")}
        color={multi ? color : undefined}
      />

      {multi && (
        <nav aria-label="Your plans" className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-wrap">
          {subs.map((s, i) => (
            <PlanTab key={s.publicId} selected={s.publicId === plan.orderId} onClick={() => switchPlan(s.publicId)}>
              <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                <span aria-hidden className="size-2 rounded-full" style={{ background: PLAN_COLORS[i % PLAN_COLORS.length] }} />
                {s.mealSizeName}{s.status === "paused" ? " (paused)" : ""}
              </span>
              <span className="text-xs leading-tight text-[var(--muted-foreground,#6E6558)]">{windowLabel(windows[s.publicId], today)}</span>
            </PlanTab>
          ))}
        </nav>
      )}

      {upcoming && (
        <button
          type="button"
          data-testid="next-delivery"
          onClick={() => goTo(upcoming.deliveryDate)}
          className={cn(FOCUS, "mb-4 flex min-h-12 w-full items-center gap-3 rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--card,#fff)] px-4 py-2.5 text-left [touch-action:manipulation]")}
        >
          <Truck aria-hidden className="size-5 shrink-0 text-[var(--muted-foreground,#6E6558)]" />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold">Next delivery: {humanDate(upcoming.deliveryDate)}, {tiffins(upcoming.units)} ({upcoming.covers.map(weekdayShort).join(" + ")})</span>
            <span className="block text-[13px] text-[var(--muted-foreground,#6E6558)]">Changes close {formatCutoff(upcoming.cutoffAt, tz)}</span>
          </span>
        </button>
      )}

      <div className="mb-4">
        <WeekStrip
          firstWeek={firstWeek}
          lastWeek={lastWeek}
          week={weekStart}
          today={today}
          selectedDay={row?.date ?? sel}
          dots={dots}
          colorOf={() => color}
          onPickDay={pickDay}
          onWeek={(m) => goWeek(m)}
        />
      </div>

      {ctx.pooled >= 1 && (
        <Notice className="mb-4 items-center justify-between">
          <span>{tiffins(ctx.pooled)} {ctx.pooled === 1 ? "is" : "are"} waiting.</span>
          <button type="button" aria-label="Schedule a make-up" onClick={() => setActive("makeup")} className="min-h-11 shrink-0 px-2 text-sm font-semibold underline underline-offset-4 [touch-action:manipulation]">Make-up<span className="hidden lg:inline"> day</span></button>
        </Notice>
      )}

      <div className={navigating ? "opacity-60 transition-opacity" : undefined} aria-busy={navigating}>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted-foreground,#6E6558)]">{weekTitle(weekStart)}</h2>
        {shown.length === 0 && !emptyDay ? (
          <Card className="space-y-3 p-6">
            <p className="text-[15px] font-semibold">Nothing to eat this week.</p>
            {next ? (
              <>
                <p className="text-sm text-[var(--muted-foreground,#6E6558)]">{next > weekStart ? "Next" : "Last"} day: {humanDate(next)}.</p>
                <Button variant="primary" onClick={() => goTo(next)}>Go to {humanDate(next)}</Button>
              </>
            ) : (
              <p className="text-sm text-[var(--muted-foreground,#6E6558)]">Nothing else is scheduled.</p>
            )}
          </Card>
        ) : (
          <>
            {emptyDay && <Card className="mb-4 p-4"><p className="text-[15px] font-semibold">Nothing planned on {humanDate(emptyDay)}.</p></Card>}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:items-start lg:gap-8">
              <div className="space-y-0.5">
                {shown.map((r) => (
                  <div key={r.date} className="flex items-center">
                    <div className="min-w-0 flex-1"><EatingRowButton row={r} selected={!!row && r.date === row.date} onSelect={(x) => select(x.date)} /></div>
                    <InfoButton label={`Details for ${humanDate(r.date)}`} onClick={() => setInfo(r)} />
                  </div>
                ))}
              </div>

              <div className="min-w-0 space-y-4">
                {row && trip && model ? (
                  <EatingCard row={row} tz={tz} reason={trip.status === "upcoming" ? null : model.closedReason ?? model.av.pick.why}>
                    <div className="mt-6 hidden lg:block">
                      <TripActions model={model} layout="card" onAction={setActive} onGoTo={goTo} />
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
                  </EatingCard>
                ) : null}
                {heldOnly && <Notice>Everything this week is on hold. Resume a trip or schedule a make-up.</Notice>}
              </div>
            </div>

            {trip && model && (model.rows.length > 0 || model.goTo || model.primary === "vacation") && (
              <div className={`${FONT} fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-30 border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_92%,transparent)] px-4 py-2 backdrop-blur-xl lg:hidden`}>
                <TripActions model={model} layout="bar" onAction={setActive} onGoTo={goTo} />
              </div>
            )}
          </>
        )}
      </div>

      {active === "vacation" ? (
        <VacationSheet plan={plan} open onDone={done} />
      ) : active === "makeup" ? (
        <ActionSheet action={active} trip={trip ?? ({ orderId: plan.orderId } as Trip)} plan={plan} open onDone={done} onChanged={changed} />
      ) : (
        active && trip && <ActionSheet action={active} trip={trip} day={row?.date} plan={plan} open onDone={done} onChanged={changed} />
      )}
      {info && <TripInfoSheet row={info} tz={tz} plan={plan} open onClose={() => setInfo(null)} />}
      <Toast open={toast !== null} onClose={closeToast}>{toast}</Toast>
    </div>
  );
}
