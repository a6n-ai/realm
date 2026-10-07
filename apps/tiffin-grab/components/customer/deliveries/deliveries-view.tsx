"use client";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Button, Card, Notice, Toast, type DeliveryStatus } from "@/components/customer/kit";
import { ClaimPayment } from "@/components/customer/wallet/claim-payment";
import { OrderStatusBadge } from "@/components/ds";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { actionAvailability, humanDate, type Trip, type TripAction } from "@/lib/deliveries-view";
import { buildEatingDays, deliveryLine, eatingRowsInWeek, isAddressRow, weekdayShort, type EatingRow } from "@/lib/deliveries-view/eating";
import { applySwapsToCounts, hasEvenPortionSwap } from "@/lib/menu/swap-rules";
import { addDays, mondayOf, type Agenda } from "@/lib/deliveries-view/week";
import type { Subscription, SubscriptionWindow } from "@/lib/services/customer-deliveries.service";
import type { ClaimPaymentContext } from "@/lib/services/orders.service";
import { actionModel } from "./action-model";
import { TripActions } from "./action-panel";
import { ActionSheet } from "./actions/registry";
import { renewDays, type PlanView } from "./adapter";
import { PlanHeader, windowLabel } from "./plan-header";
import { EatingCard, mealCategories, splitMealAddons, TripInfoSheet } from "./trip-parts";
import { WeekStrip } from "./week-strip";
import { deliveryAddress } from "@/lib/deliveries-view/current-address";

const ACTIONS: TripAction[] = ["pick", "swap", "move"];
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
  /** Account name for the page heading. */
  customerName?: string | null;
  /** An e-Transfer is unconfirmed: calendar is hidden; claim form is shown instead. */
  locked?: boolean;
  /** Claim form for payment-review plans; null when settled or unavailable. */
  claimPayment?: ClaimPaymentContext | null;
  currency?: string;
  initialTrip: string | null;
  initialAction?: string | null;
}

function PlanTab({ selected, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return <button type="button" aria-pressed={selected} {...rest} className={cn(FOCUS, "flex min-h-11 shrink-0 flex-col justify-center rounded-2xl border-[1.5px] px-4 py-1.5 text-left [touch-action:manipulation]", selected ? "border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)]" : "border-[var(--border)] bg-[var(--card,#fff)]", className)} />;
}
const rank = (t: Trip) => (t.status === "upcoming" ? 0 : t.status === "failed" ? 1 : 2);

export function DeliveriesView({ plan, subs, windows, trips, agenda, weekStart, firstWeek, lastWeek, now, customerName, locked = false, claimPayment = null, currency = "CAD", initialTrip, initialAction }: Props) {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const multi = subs.length > 1;

  const [sel, setSel] = useState<string | null>(initialTrip);
  const [wk, setWk] = useState(weekStart);
  if (wk !== weekStart) {
    setWk(weekStart);
    setSel(initialTrip);
  }
  const [requested, setActive] = useState<TripAction | null>(() => ACTIONS.find((a) => a === initialAction) ?? null);
  // Payment unconfirmed: the plan is view-only, so no sheet opens from any entry point (buttons, ?action= links).
  const active = locked ? null : requested;
  const [info, setInfo] = useState<EatingRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { ctx, sub, today } = plan;
  const tz = ctx.timezone;
  const weekEnd = addDays(weekStart, 6);

  const shown = useMemo(() => eatingRowsInWeek(trips, weekStart, weekEnd), [trips, weekStart, weekEnd]);
  const allRows = useMemo(() => buildEatingDays(trips), [trips]);
  const inWeek = !!sel && sel >= weekStart && sel <= weekEnd;
  // Tapping the truck day (the date a moved tiffin arrives) selects that meal even when its eat date is another week.
  const row: EatingRow | null = (sel ? shown.find((r) => r.date === sel) ?? shown.find((r) => r.trip.date === sel) : null) ?? (inWeek ? null : [...shown].sort((a, b) => rank(a.trip) - rank(b.trip) || a.date.localeCompare(b.date))[0] ?? null);
  const trip = row?.trip ?? null;
  const emptyDay = !row && inWeek ? sel : null;
  // Swap only when this eating day has a swap the customer can still make (same filter the swap sheet applies).
  const eatingSwaps = trip && row ? plan.days.find((d) => d.date === trip.date)?.eatingDays?.find((e) => e.date === row.date) : undefined;
  const left = plan.sub.categoryCounts ? applySwapsToCounts(plan.sub.categoryCounts, eatingSwaps?.appliedSwaps ?? []) : null;
  // Entry gate: at least one configured pair has an even-portion give count left.
  // Full Max TU / Meal Rules filtering still happens in listValidSwapOptionsForDelivery.
  const canSwap = (eatingSwaps?.swapPairs ?? []).some((p) => {
    const available = left ? (left[p.fromCategory] ?? 0) : 1;
    const cats = plan.swapCategories ?? {};
    return hasEvenPortionSwap(cats[p.fromCategory], cats[p.toCategory], available);
  });
  // The menu of this week isn't out: pick/swap are disabled, everything else (dates, move, info) still shows.
  const weekDays = plan.days.filter((d) => d.date >= weekStart && d.date <= weekEnd);
  const menuOut = weekDays.length > 0 && weekDays.every((d) => d.menuWeekId == null);
  const model = trip ? actionModel(trip, now, ctx, { canSwap, menuOut: menuOut && trip.date >= weekStart && trip.date <= weekEnd, locked, isDeliveryDay: row ? isAddressRow(allRows, row) : true, movedTo: row?.movedTo, trial: plan.sub.trial === true }) : null;

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
  // A plain replace can serve the previous plan's cached RSC render for the same path — refresh forces this plan's own ctx/counts.
  const switchPlan = (id: string) => startNav(() => (router.replace(`/me?sub=${id}`, { scroll: false }), router.refresh()));

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
  const addressRow = model?.rows.find((r) => r.key === "address");
  const tiles = row ? splitMealAddons(mealCategories(row, plan), sub.addons) : { meal: [], addons: [] };
  const helpHref = trip ? `/me/support/new?orderId=${encodeURIComponent(plan.orderId)}&date=${trip.date}` : undefined;
  const hasBar = !locked && !!(trip && model && (model.rows.length > 0 || model.goTo));

  return (
    <div className={`${FONT} ${hasBar ? "pb-14" : "pb-4"} lg:pb-8`}>
      <PlanHeader
        name={customerName}
        sub={sub}
        counts={plan.counts}
        renew={renewDays(plan.counts.lastDeliveryDate, today)}
      />

      {multi && (
        <nav aria-label="Your plans" className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-wrap">
          {subs.map((s) => (
            <PlanTab key={s.publicId} selected={s.publicId === plan.orderId} onClick={() => switchPlan(s.publicId)}>
              <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                {s.mealSizeName}
                <OrderStatusBadge status={s.displayStatus} />
              </span>
              <span className="text-xs leading-tight text-[var(--muted-foreground,#6E6558)]">{windowLabel(windows[s.publicId], today)}</span>
            </PlanTab>
          ))}
        </nav>
      )}

      {locked && claimPayment && (
        <Card className="mb-4 p-5" data-testid="payment-claim">
          <ClaimPayment ctx={claimPayment} currency={currency} />
        </Card>
      )}

      {locked && !claimPayment && (
        <Notice>Confirming your payment. You can make changes once it&apos;s approved.</Notice>
      )}

      {!locked && (
      <>
      <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-9 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:items-start lg:gap-12", navigating && "opacity-60 transition-opacity")} aria-busy={navigating}>
        {/* Schedule picks the day; everything below it is that day's delivery. */}
        <div className="min-w-0">
          <WeekStrip
            firstWeek={firstWeek}
            lastWeek={lastWeek}
            week={weekStart}
            today={today}
            selectedDay={row?.date ?? sel}
            agenda={agenda}
            now={now}
            onPickDay={pickDay}
            onWeek={(m) => goWeek(m)}
          />

          {menuOut && <p className="mt-3 text-sm text-[var(--muted-foreground,#6E6558)]" data-testid="menu-not-released"><span className="font-semibold text-[var(--foreground)]">Menu not released yet.</span> You can still move a day.</p>}
          {shown.length === 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-[15px] font-semibold">Nothing to eat this week.</p>
              {next ? <Button variant="primary" onClick={() => goTo(next)}>Go to {humanDate(next)}</Button> : <p className="text-sm text-[var(--muted-foreground,#6E6558)]">Nothing else is scheduled.</p>}
            </div>
          )}
        </div>
        <div className="min-w-0">
          {row && trip && model ? (
            <EatingCard
              row={row}
              tz={tz}
              eyebrow={trip.date === upcoming?.deliveryDate && trip.status === "upcoming" ? "Next delivery" : null}
              menuOut={menuOut && trip.date >= weekStart && trip.date <= weekEnd}
              reason={trip.status === "upcoming" ? null : model.closedReason ?? model.av.pick.why}
              address={deliveryAddress(trip.addressOverride, sub)}
              onDetails={tiles.meal.length > 0 ? undefined : () => setInfo(row)}
              meal={tiles.meal}
              addonTiles={tiles.addons}
              onEditAddress={addressRow?.av.ok ? () => setActive("address") : undefined}
            >
              <div className="mt-6 hidden lg:block">
                <TripActions model={model} layout="card" onAction={setActive} onGoTo={goTo} helpHref={helpHref} hide={addressRow?.av.ok ? ["address"] : []} />
              </div>
            </EatingCard>
          ) : emptyDay ? (
            <p className="text-[15px] font-semibold">Nothing planned on {humanDate(emptyDay)}.</p>
          ) : null}
        </div>
      </div>

      {trip && model && (model.rows.length > 0 || model.goTo) && (
        <div className={`${FONT} fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-30 border-t border-[var(--border)] bg-[color-mix(in_oklab,var(--card)_92%,transparent)] px-4 py-2 backdrop-blur-xl lg:hidden`}>
          <TripActions model={model} layout="bar" onAction={setActive} onGoTo={goTo} helpHref={helpHref} hide={addressRow?.av.ok ? ["address"] : []} />
        </div>
      )}
      </>
      )}

      {active && trip && <ActionSheet action={active} trip={trip} day={row?.date} plan={plan} agenda={agenda} open onDone={done} onChanged={changed} />}
      {info && <TripInfoSheet row={info} tz={tz} plan={plan} open onClose={() => setInfo(null)} />}
      <Toast open={toast !== null} onClose={closeToast}>{toast}</Toast>
    </div>
  );
}
