"use client";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Button, Card, Notice, Toast, type DeliveryStatus } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { actionAvailability, formatCutoff, humanDate, type Trip, type TripAction } from "@/lib/deliveries-view";
import { buildEatingDays, weekdayShort, type EatingRow } from "@/lib/deliveries-view/eating";
import { addDays, dotStatus, mondayOf, PLAN_COLORS, type Agenda } from "@/lib/deliveries-view/week";
import type { SubscriptionWindow } from "@/lib/services/customer-deliveries.service";
import { actionModel } from "./action-model";
import { TripActions } from "./action-panel";
import { ActionSheet } from "./actions/registry";
import { VacationSheet } from "./actions/vacation-sheet";
import { renewDays, type PlanView } from "./adapter";
import { PlanHeader, windowLabel } from "./plan-header";
import { EatingCard, EatingRowButton, tiffins, type PlanTagInfo } from "./trip-parts";
import { WeekStrip } from "./week-strip";

const ACTIONS: TripAction[] = ["pick", "swap", "hold", "resume", "move", "vacation", "makeup", "pool"];
const WEEK = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const weekTitle = (m: string) => `${WEEK.format(new Date(`${m}T00:00:00Z`))} – ${WEEK.format(new Date(`${addDays(m, 6)}T00:00:00Z`))}`;

interface Props {
  /** Every active/paused plan, ordered by start date (colour follows this order). */
  plans: PlanView[];
  windows: Record<string, SubscriptionWindow>;
  /** Trips of the selected week across all plans. */
  trips: Trip[];
  agenda: Agenda;
  weekStart: string;
  lastWeek: string;
  now: number;
  initialTrip: string | null;
  initialPlan: string | null;
  initialFilter: string | null;
  initialAction?: string | null;
}

function PlanChip({ selected, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return <button type="button" aria-pressed={selected} {...rest} className={cn(FOCUS, "inline-flex min-h-11 shrink-0 items-center rounded-full border-[1.5px] px-4 text-sm font-semibold [touch-action:manipulation]", selected ? "border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)]" : "border-[var(--border)] bg-[var(--card,#fff)]", className)} />;
}
const rank = (t: Trip) => (t.status === "upcoming" ? 0 : t.status === "hold" ? 1 : 2);

export function DeliveriesView({ plans, windows, trips, agenda, weekStart, lastWeek, now, initialTrip, initialPlan, initialFilter, initialAction }: Props) {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const multi = plans.length > 1;
  const plansByOrder = useMemo(() => Object.fromEntries(plans.map((p) => [p.orderId, p])), [plans]);
  const colorOf = useCallback((id: string) => PLAN_COLORS[Math.max(plans.findIndex((p) => p.orderId === id), 0) % PLAN_COLORS.length]!, [plans]);
  const tagOf = (id: string): PlanTagInfo | undefined => {
    const p = plansByOrder[id];
    return multi && p ? { color: colorOf(id), label: `${p.sub.mealSizeName} · ${p.sub.tagLabel || p.sub.planName}` } : undefined;
  };

  const [filter, setFilter] = useState<string | null>(initialFilter && plansByOrder[initialFilter] ? initialFilter : null);
  const [sel, setSel] = useState<{ date: string | null; orderId: string | null }>({ date: initialTrip, orderId: initialPlan });
  const [wk, setWk] = useState(weekStart);
  if (wk !== weekStart) {
    setWk(weekStart);
    setSel({ date: initialTrip, orderId: initialPlan });
  }
  const [active, setActive] = useState<TripAction | null>(() => ACTIONS.find((a) => a === initialAction) ?? null);
  const [toast, setToast] = useState<string | null>(null);
  const today = plans[0]!.today;
  const tz = plans[0]!.ctx.timezone;

  const inFilter = (t: { orderId: string }) => !filter || t.orderId === filter;
  const weekEnd = addDays(weekStart, 6);
  const rows = useMemo(() => buildEatingDays(trips.filter(inFilter)).filter((r) => r.date >= weekStart && r.date <= weekEnd), [trips, filter, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps
  const order = (id: string) => plans.findIndex((p) => p.orderId === id);
  const shown = [...rows].sort((a, b) => a.date.localeCompare(b.date) || order(a.orderId) - order(b.orderId));

  const onDay = sel.date ? shown.filter((r) => r.date === sel.date) : [];
  const row: EatingRow | null =
    onDay.find((r) => r.orderId === sel.orderId) ??
    [...onDay].sort((a, b) => rank(a.trip) - rank(b.trip))[0] ??
    (sel.date && sel.date >= weekStart && sel.date <= weekEnd ? null : [...shown].sort((a, b) => rank(a.trip) - rank(b.trip) || a.date.localeCompare(b.date))[0] ?? null);
  const trip = row?.trip ?? null;
  const emptyDay = !row && sel.date && sel.date >= weekStart && sel.date <= weekEnd ? sel.date : null;

  const activePlan: PlanView = plansByOrder[trip?.orderId ?? filter ?? ""] ?? plans[0]!;
  const { ctx, sub } = activePlan;
  const model = trip ? actionModel(trip, now, activePlan.ctx) : null;
  const vacAv = trip ? actionAvailability(trip, now, ctx).vacation : null;

  const dots = useMemo(() => {
    const out: Record<string, { orderId: string; status: DeliveryStatus; truck: boolean }[]> = {};
    for (const [date, ds] of Object.entries(agenda)) {
      const list = ds.filter(inFilter).map((d) => ({ orderId: d.orderId, status: dotStatus(d, now), truck: d.truck }));
      if (list.length) out[date] = list;
    }
    return out;
  }, [agenda, filter, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const qs = (over: Record<string, string | null>) => {
    const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    for (const [k, v] of Object.entries(over)) (v === null ? p.delete(k) : p.set(k, v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const goWeek = (monday: string, over: Record<string, string | null> = {}) =>
    startNav(() => router.replace(`/me${qs({ week: monday, trip: null, action: null, ...over })}`, { scroll: false }));
  const select = (t: { date: string; orderId: string | null }) => {
    setSel({ date: t.date, orderId: t.orderId });
    window.history.replaceState(null, "", qs({ trip: t.date, action: null }));
    if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goTo = (date: string, orderId?: string) => {
    const mon = mondayOf(date);
    if (mon === weekStart) return select({ date, orderId: orderId ?? sel.orderId });
    setSel({ date, orderId: orderId ?? null });
    goWeek(mon, { trip: date });
  };
  const pickDay = (iso: string) => {
    if (mondayOf(iso) !== weekStart) return goTo(iso);
    select({ date: iso, orderId: null });
  };
  const pickFilter = (id: string | null) => {
    setFilter(id);
    setSel((s) => ({ date: s.date, orderId: null }));
    window.history.replaceState(null, "", qs({ sub: id }));
  };

  const closeToast = useCallback(() => setToast(null), []);
  const changed = (message: string) => (setToast(message), router.refresh());
  const done = (message?: string) => {
    setActive(null);
    if (message) changed(message);
  };
  const linkCls = "text-sm font-semibold text-[var(--muted-foreground,#6E6558)] underline underline-offset-4 [touch-action:manipulation]";

  const nextDates = Object.keys(agenda).filter((d) => agenda[d]!.some(inFilter)).sort();
  const next = nextDates.find((d) => d > weekEnd) ?? [...nextDates].reverse().find((d) => d < weekStart) ?? null;
  const nextOrder = next ? agenda[next]!.find(inFilter)?.orderId : undefined;
  const nextPlan = nextOrder ? plansByOrder[nextOrder] : undefined;
  const upcoming = Object.values(agenda).flat().filter((d) => d.truck && d.status === "scheduled" && d.deliveryDate >= today && inFilter(d)).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate) || order(a.orderId) - order(b.orderId));
  const nextTruck = upcoming.filter((d) => d.deliveryDate === upcoming[0]?.deliveryDate);
  const heldOnly = shown.length > 0 && shown.every((r) => r.trip.status === "hold");

  const chips = multi && (
    <div role="group" aria-label="Filter by plan" className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-wrap">
      <PlanChip selected={!filter} onClick={() => pickFilter(null)}>All plans</PlanChip>
      {plans.map((p) => (
        <PlanChip key={p.orderId} selected={filter === p.orderId} onClick={() => pickFilter(p.orderId)} aria-label={`${p.sub.mealSizeName} ${p.sub.tagLabel || p.sub.planName}${p.sub.status === "paused" ? " (paused)" : ""}, ${windowLabel(windows[p.orderId], today) ?? ""}`}>
          <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: colorOf(p.orderId) }} />
          {p.sub.mealSizeName}
          <span className="ml-1.5 text-xs font-normal opacity-70">{windowLabel(windows[p.orderId], today)}</span>
        </PlanChip>
      ))}
    </div>
  );

  return (
    <div className={`${FONT} pb-[190px] lg:pb-8`}>
      <PlanHeader
        sub={sub}
        counts={activePlan.counts}
        renew={renewDays(activePlan.counts.lastDeliveryDate, today)}
        onVacation={!!ctx.onVacation}
        onVacationClick={() => setActive("vacation")}
        color={multi ? colorOf(activePlan.orderId) : undefined}
      />
      {chips}

      {nextTruck.length > 0 && (
        <section aria-label="Next delivery" data-testid="next-delivery" className="mb-4 space-y-2">
          {nextTruck.map((d) => (
            <button
              key={d.orderId}
              type="button"
              onClick={() => goTo(d.deliveryDate, d.orderId)}
              className={cn(FOCUS, "flex min-h-14 w-full flex-col items-start rounded-2xl border-[1.5px] border-[var(--border)] bg-[var(--card,#fff)] px-4 py-3 text-left [touch-action:manipulation]")}
            >
              <span className="text-[15px] font-semibold">
                Next delivery: {humanDate(d.deliveryDate)}, {tiffins(d.units)} ({d.covers.map(weekdayShort).join(" + ")})
                {multi && plansByOrder[d.orderId] ? ` · ${plansByOrder[d.orderId]!.sub.mealSizeName}` : ""}
              </span>
              <span className="text-[13px] text-[var(--muted-foreground,#6E6558)]">Changes close {formatCutoff(d.cutoffAt, tz)}</span>
            </button>
          ))}
        </section>
      )}

      <div className="mb-4">
        <WeekStrip
          firstWeek={mondayOf(today)}
          lastWeek={lastWeek}
          week={weekStart}
          today={today}
          selectedDay={row?.date ?? sel.date}
          dots={dots}
          colorOf={colorOf}
          onPickDay={pickDay}
          onWeek={(m) => goWeek(m)}
        />
      </div>

      {ctx.pooled >= 1 && (
        <Notice className="mb-4 items-center justify-between">
          <span>{tiffins(ctx.pooled)} {ctx.pooled === 1 ? "is" : "are"} waiting{multi ? ` on ${sub.mealSizeName}` : ""}.</span>
          <button type="button" aria-label="Schedule a make-up" onClick={() => setActive("makeup")} className="min-h-11 shrink-0 px-2 text-sm font-semibold underline underline-offset-4 [touch-action:manipulation]">Make-up<span className="hidden lg:inline"> day</span></button>
        </Notice>
      )}

      <div className={navigating ? "opacity-60 transition-opacity" : undefined} aria-busy={navigating}>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted-foreground,#6E6558)]">{weekTitle(weekStart)}</h2>
        {shown.length === 0 && !emptyDay ? (
          <Card className="space-y-3 p-6">
            <p className="text-[15px] font-semibold">Nothing to eat this week{filter ? " on this plan" : ""}.</p>
            {next ? (
              <>
                <p className="text-sm text-[var(--muted-foreground,#6E6558)]">
                  {next > weekStart ? "Next" : "Last"} delivery: {humanDate(next)}{multi && nextPlan ? ` · ${nextPlan.sub.mealSizeName}` : ""}.
                </p>
                <Button variant="primary" onClick={() => goTo(next, nextOrder)}>Go to {humanDate(next)}</Button>
              </>
            ) : (
              <p className="text-sm text-[var(--muted-foreground,#6E6558)]">Nothing else is scheduled.</p>
            )}
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:items-start lg:gap-8">
              <div className="space-y-0.5">
                {shown.map((r) => <EatingRowButton key={`${r.orderId}:${r.date}`} row={r} plan={tagOf(r.orderId)} selected={!!row && r.orderId === row.orderId && r.date === row.date} onSelect={(x) => select({ date: x.date, orderId: x.orderId })} />)}
              </div>

              <div className="min-w-0 space-y-4">
                {row && trip && model ? (
                  <EatingCard row={row} tz={tz} plan={tagOf(trip.orderId)} reason={trip.status === "upcoming" ? null : model.closedReason ?? model.av.pick.why}>
                    <div className="mt-6 hidden lg:block">
                      {trip.coversDates.length > 1 && trip.status === "upcoming" && (
                        <p className="mb-3 hidden text-[13px] lg:block text-[var(--muted-foreground,#6E6558)]">Hold applies to the whole trip: holds {trip.coversDates.map(weekdayShort).join(" + ")}.</p>
                      )}
                      <TripActions model={model} layout="card" onAction={setActive} onGoTo={(d) => goTo(d, trip.orderId)} />
                      <div className="mt-4">
                        {ctx.onVacation ? (
                          <button type="button" className={linkCls} onClick={() => setActive("vacation")}>On vacation · Resume deliveries</button>
                        ) : vacAv?.ok === false ? (
                          <p className="text-sm text-[var(--muted-foreground,#6E6558)]">{vacAv.why}</p>
                        ) : (
                          <button type="button" className={linkCls} onClick={() => setActive("vacation")}>Going away? Vacation{multi ? ` (${sub.mealSizeName})` : ""}</button>
                        )}
                      </div>
                    </div>
                  </EatingCard>
                ) : emptyDay ? (
                  <Card className="p-6"><p className="text-[15px] font-semibold">Nothing planned on {humanDate(emptyDay)}.</p></Card>
                ) : null}
                {heldOnly && <Notice>Everything this week is on hold. Resume a trip or schedule a make-up.</Notice>}
              </div>
            </div>

            {trip && trip.coversDates.length > 1 && trip.status === "upcoming" && (
              <p className="mt-3 text-[13px] text-[var(--muted-foreground,#6E6558)] lg:hidden">Hold applies to the whole trip: holds {trip.coversDates.map(weekdayShort).join(" + ")}.</p>
            )}
            {trip && model && (model.rows.length > 0 || model.goTo || model.primary === "vacation") && (
              <div className={`${FONT} fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-30 border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_92%,transparent)] px-4 py-2 backdrop-blur-xl lg:hidden`}>
                <TripActions model={model} layout="bar" onAction={setActive} onGoTo={(d) => goTo(d, trip.orderId)} />
              </div>
            )}
          </>
        )}
      </div>

      {active === "vacation" ? (
        <VacationSheet plan={activePlan} open onDone={done} />
      ) : active === "makeup" ? (
        <ActionSheet action={active} trip={trip ?? ({ orderId: activePlan.orderId } as Trip)} plan={activePlan} open onDone={done} onChanged={changed} />
      ) : (
        active && trip && <ActionSheet action={active} trip={trip} day={row?.date} plan={plansByOrder[trip.orderId] ?? activePlan} open onDone={done} onChanged={changed} />
      )}
      <Toast open={toast !== null} onClose={closeToast}>{toast}</Toast>
    </div>
  );
}
