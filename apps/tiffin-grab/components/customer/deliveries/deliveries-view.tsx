"use client";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Button, Card, Notice, Toast, type DeliveryStatus } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { actionAvailability, humanDate, type Trip, type TripAction } from "@/lib/deliveries-view";
import { addDays, dotStatus, mondayOf, PLAN_COLORS, type Agenda } from "@/lib/deliveries-view/week";
import type { SubscriptionWindow } from "@/lib/services/customer-deliveries.service";
import { actionModel } from "./action-model";
import { TripActions } from "./action-panel";
import { ActionSheet } from "./actions/registry";
import { VacationSheet } from "./actions/vacation-sheet";
import { renewDays, type PlanView } from "./adapter";
import { PlanHeader, windowLabel } from "./plan-header";
import { TripCard, TripRow, tiffins, type PlanTagInfo } from "./trip-parts";
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
const key = (t: { orderId: string; date: string }) => `${t.orderId}:${t.date}`;
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
  const merged = (t: Trip) => t.status === "combined-into" && trips.some((x) => x.orderId === t.orderId && x.date === t.mergedInto);
  const visible = useMemo(() => trips.filter((t) => inFilter(t) && !merged(t)), [trips, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const resolve = (t: Trip | undefined) => (t?.mergedInto ? trips.find((x) => x.orderId === t.orderId && x.date === t.mergedInto) ?? t : t);

  const onDay = sel.date ? visible.filter((t) => t.date === sel.date || t.coversDates.includes(sel.date!)) : [];
  const picked =
    resolve(onDay.find((t) => t.orderId === sel.orderId) ?? onDay.sort((a, b) => rank(a) - rank(b))[0]) ??
    (sel.date && sel.date >= weekStart && sel.date <= addDays(weekStart, 6) ? null : [...visible].sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date))[0]);
  const trip = picked ?? null;
  const emptyDay = !trip && sel.date && sel.date >= weekStart && sel.date <= addDays(weekStart, 6) ? sel.date : null;

  const activePlan: PlanView = plansByOrder[trip?.orderId ?? filter ?? ""] ?? plans[0]!;
  const { ctx, sub } = activePlan;
  const model = trip ? actionModel(trip, now, activePlan.ctx) : null;
  const vacAv = trip ? actionAvailability(trip, now, ctx).vacation : null;

  const dots = useMemo(() => {
    const out: Record<string, { orderId: string; status: DeliveryStatus }[]> = {};
    for (const [date, ds] of Object.entries(agenda)) {
      const list = ds.filter(inFilter).map((d) => ({ orderId: d.orderId, status: dotStatus(d, now) }));
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
  const select = (t: Pick<Trip, "date" | "orderId">) => {
    setSel({ date: t.date, orderId: t.orderId });
    window.history.replaceState(null, "", qs({ trip: t.date, action: null }));
    if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goTo = (date: string, orderId?: string) => {
    const mon = mondayOf(date);
    if (mon === weekStart) return select({ date, orderId: orderId ?? sel.orderId ?? "" });
    setSel({ date, orderId: orderId ?? null });
    goWeek(mon, { trip: date });
  };
  const pickDay = (iso: string) => {
    if (mondayOf(iso) !== weekStart) return goTo(iso);
    const t = resolve(visible.find((x) => x.date === iso) ?? visible.find((x) => x.coversDates.includes(iso)));
    if (t) select(t);
    else {
      setSel({ date: iso, orderId: null });
      window.history.replaceState(null, "", qs({ trip: iso, action: null }));
    }
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
  const next = nextDates.find((d) => d > addDays(weekStart, 6)) ?? [...nextDates].reverse().find((d) => d < weekStart) ?? null;
  const nextOrder = next ? agenda[next]!.find(inFilter)?.orderId : undefined;
  const nextPlan = nextOrder ? plansByOrder[nextOrder] : undefined;
  const shown = [...visible].sort((a, b) => a.date.localeCompare(b.date) || plans.findIndex((p) => p.orderId === a.orderId) - plans.findIndex((p) => p.orderId === b.orderId));
  const heldOnly = visible.length > 0 && visible.every((t) => t.status === "hold");

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

      <div className="mb-4">
        <WeekStrip
          firstWeek={mondayOf(today)}
          lastWeek={lastWeek}
          week={weekStart}
          today={today}
          selectedDay={sel.date}
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
        {shown.length === 0 ? (
          <Card className="space-y-3 p-6">
            <p className="text-[15px] font-semibold">No deliveries this week{filter ? " on this plan" : ""}.</p>
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
            <div className="grid gap-6 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:items-start lg:gap-8">
              <div className="space-y-0.5">
                {shown.map((t) => <TripRow key={key(t)} trip={t} tz={tz} plan={tagOf(t.orderId)} selected={!!trip && key(t) === key(trip)} onSelect={(x) => (x.status === "combined-into" ? goTo(x.mergedInto!, x.orderId) : select(x))} />)}
              </div>

              <div className="min-w-0 space-y-4">
                {trip && model ? (
                  <TripCard trip={trip} tz={tz} plan={tagOf(trip.orderId)} reason={trip.status === "upcoming" ? null : model.closedReason ?? model.av.pick.why}>
                    <div className="mt-6 hidden lg:block">
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
                  </TripCard>
                ) : emptyDay ? (
                  <Card className="p-6"><p className="text-[15px] font-semibold">No delivery on {humanDate(emptyDay)}.</p></Card>
                ) : null}
                {heldOnly && <Notice>Everything this week is on hold. Resume a trip or schedule a make-up.</Notice>}
              </div>
            </div>

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
        active && trip && <ActionSheet action={active} trip={trip} plan={plansByOrder[trip.orderId] ?? activePlan} open onDone={done} onChanged={changed} />
      )}
      <Toast open={toast !== null} onClose={closeToast}>{toast}</Toast>
    </div>
  );
}
