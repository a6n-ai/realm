"use client";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button, Card, Notice, Toast } from "@/components/customer/kit";
import { ClaimPayment } from "@/components/customer/wallet/claim-payment";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { humanDate, type Trip, type TripAction } from "@/lib/deliveries-view";
import { buildEatingDays, eatingRowsInWeek, isAddressRow, type EatingRow } from "@/lib/deliveries-view/eating";
import { applySwapsToCounts, hasEvenPortionSwap } from "@/lib/menu/swap-rules";
import { addDays, mondayOf, type Agenda } from "@/lib/deliveries-view/week";
import type { Subscription, SubscriptionWindow } from "@/lib/services/customer-deliveries.service";
import type { ClaimPaymentContext } from "@/lib/services/orders.service";
import { actionModel, PAUSE_OR_RESUME_LABEL, RESUME_DAY_LABEL } from "./action-model";
import { pausedLine, resumeLine } from "./pause-copy";
import { TripActions } from "./action-panel";
import { ActionSheet } from "./actions/registry";
import { PauseSheet } from "./actions/pause-sheet";
import { pauseMyDays, releaseMyDays } from "@/app/(customer)/me/deliveries/actions";
import { planLines, renewDays, type PlanView } from "./adapter";
import { PlanHeader, windowLabel } from "./plan-header";
import { EatingCard, mealCategories, splitMealAddons, TripInfoSheet } from "./trip-parts";
import { WeekStrip } from "./week-strip";
import { deliveryAddress } from "@/lib/deliveries-view/current-address";

const ACTIONS: TripAction[] = ["pick", "swap", "move"];

interface Props {
  /** The ONE plan on screen; switching plans reloads the page for the other plan. */
  plan: PlanView;
  /** All the customer's plans, ordered by start date, for the tabs on top. */
  subs: Subscription[];
  /** A further plan is booked but not live yet (payment or confirmation pending), so it is not in `subs`. */
  waitingRenewal?: boolean;
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
  cardAvailable?: boolean;
  currency?: string;
  initialTrip: string | null;
  initialAction?: string | null;
}

/** One pill of the plan tab bar: one line, never shrinks, snaps into place when the bar is swiped. */
function PlanTab({ selected, className, ...rest }: React.ComponentProps<"button"> & { selected: boolean }) {
  return <button type="button" aria-pressed={selected} {...rest} className={cn(FOCUS, "min-h-10 shrink-0 snap-start whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors [touch-action:manipulation]", selected ? "bg-[var(--primary-wash,#FBE3D2)] text-[var(--foreground)] ring-[1.5px] ring-[var(--primary)]" : "c-surface bg-[var(--card,#fff)] text-[var(--muted-foreground,#6E6558)] hover:text-[var(--foreground)]", className)} />;
}
const DEAD = new Set(["cancelled", "rejected"]);
const rank = (t: Trip) => (t.status === "upcoming" ? 0 : t.status === "failed" ? 1 : 2);

export function DeliveriesView({ plan, subs, waitingRenewal = false, windows, trips, agenda, weekStart, firstWeek, lastWeek, now, customerName, locked = false, claimPayment = null, cardAvailable = false, currency = "CAD", initialTrip, initialAction }: Props) {
  const router = useRouter();
  const [navigating, startNav] = useTransition();

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
  const [pauseOpen, setPauseOpen] = useState(false);
  const [releasing, startRelease] = useTransition();
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
    return hasEvenPortionSwap(cats[p.fromCategory], cats[p.toCategory], available, p.receivesMissing);
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
  // From the pause drawer: go to that paused day (any week) and open Move on it.
  const moveDay = (iso: string) => {
    setPauseOpen(false);
    goTo(iso);
    setActive("move");
  };
  // A plain replace can serve the previous plan's cached RSC render for the same path — refresh forces this plan's own ctx/counts.
  const switchPlan = (id: string) => startNav(() => (router.replace(`/me?sub=${id}`, { scroll: false }), router.refresh()));

  // Renewals continue a plan, so they share its tab; only plans running side by side get tabs of their own.
  const lines = planLines(subs.filter((s) => !DEAD.has(s.displayStatus)), windows);
  const line = lines.find((l) => l.some((s) => s.publicId === plan.orderId)) ?? [];
  const at = line.findIndex((s) => s.publicId === plan.orderId);
  const after = line[at + 1];
  const before = at > 0 ? line[at - 1] : undefined;
  const lower = (x: string | null | undefined, sep: string) => (x ? `${sep}${x.replace(/^./, (c) => c.toLowerCase())}` : "");
  const renewal: string | null = after
    ? `Renewed · next plan${lower(windowLabel(windows[after.publicId], today), " ")}`
    : before
      ? `Renewal${lower(windowLabel(windows[plan.orderId], today), " · ")}`
      : waitingRenewal
        ? "Renewed · next plan is waiting for confirmation"
        : null;
  // Every live plan gets a tab, ordered by start; the meal name joins the dates once dates alone can't tell plans apart.
  const tabs = lines.flat().sort((a, b) => (windows[a.publicId]?.first ?? "").localeCompare(windows[b.publicId]?.first ?? ""));
  const named = lines.length > 1 || new Set(tabs.map((s) => s.mealSizeName)).size > 1;

  const closeToast = useCallback(() => setToast(null), []);
  const changed = (message: string) => (setToast(message), router.refresh());
  const done = (message?: string) => {
    setActive(null);
    // A sheet opened from ?action= must not reopen when the page data refreshes.
    if (new URLSearchParams(window.location.search).has("action")) window.history.replaceState(null, "", qs({ action: null }));
    if (message) changed(message);
  };
  const resume = (dates: string[] | "all") => startRelease(async () => {
    const res = await releaseMyDays(plan.orderId, dates);
    if ("error" in res) return setToast(res.error);
    const line = resumeLine(res.dates, res.reclosed);
    if (line) done(line);
    else setToast("Nothing was resumed.");
  });

  const pauseDay = (date: string) => startRelease(async () => {
    const res = await pauseMyDays(plan.orderId, [date]);
    if ("error" in res) return setToast(res.error);
    if (res.paused.length === 0) return setToast("Nothing was paused. That day is past its cutoff.");
    done(pausedLine(res.paused, res.skipped));
  });

  const dates = Object.keys(agenda).sort();
  const next = dates.find((d) => d > weekEnd) ?? [...dates].reverse().find((d) => d < weekStart) ?? null;
  const upcoming = Object.values(agenda).flat().filter((d) => d.truck && d.status === "scheduled" && d.deliveryDate >= today).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))[0];
  const addressRow = model?.rows.find((r) => r.key === "address");
  const tiles = row ? splitMealAddons(mealCategories(row, plan), sub.addons) : { meal: [], addons: [] };
  const hasBar = !locked && !!(trip && model && (model.rows.length > 0 || model.goTo || model.resume.day));

  return (
    <div className={`${FONT} ${hasBar ? "pb-20" : "pb-4"} lg:pb-8`}>
      <PlanHeader
        name={customerName}
        sub={sub}
        counts={plan.counts}
        renew={renewDays(plan.counts.lastDeliveryDate, today)}
        renewal={renewal}
        plans={tabs.length > 1 && (
          // Swipeable and edge to edge on a phone (cancels the page's px-4): the pill cut off at the screen edge says there is more.
          <nav aria-label="Your plans" className="-mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:scroll-px-0 lg:px-0">
            {tabs.map((s) => {
              const dot = lines.length > 1 && s.tagColor && /^#[0-9a-fA-F]{6}$/.test(s.tagColor) ? s.tagColor : null;
              const selected = s.publicId === plan.orderId;
              return (
                <PlanTab
                  key={s.publicId}
                  selected={selected}
                  ref={selected ? (el) => el?.scrollIntoView?.({ block: "nearest", inline: "center" }) : undefined}
                  onClick={() => switchPlan(s.publicId)}
                >
                  {dot && <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: dot }} />}
                  {named ? `${s.mealSizeCustom ? "Custom meal" : s.mealSizeName} · ` : ""}{windowLabel(windows[s.publicId], today) ?? s.mealSizeName}
                </PlanTab>
              );
            })}
          </nav>
        )}
        actions={!locked && !plan.sub.trial ? (
          <>
            <Button className="min-h-11 whitespace-nowrap" onClick={() => setPauseOpen(true)}>{PAUSE_OR_RESUME_LABEL}</Button>
          </>
        ) : undefined}
      />

      {locked && claimPayment && (
        <Card className="mb-4 p-5" data-testid="payment-claim">
          {claimPayment.methodId === "stripe" ? (
            <div className="space-y-3">
              {cardAvailable ? (
                <>
                  <p className="text-sm">Your plan is reserved. Pay by card to get it started.</p>
                  <Link href={`/me/pay/${claimPayment.paymentPublicId}`} className="inline-flex h-11 items-center rounded-full bg-[var(--primary)] px-6 text-sm font-semibold text-[var(--primary-foreground,#fff)]">
                    Pay by card
                  </Link>
                </>
              ) : (
                <Notice>Card payments are paused right now. Please contact us.</Notice>
              )}
            </div>
          ) : (
            <ClaimPayment ctx={claimPayment} currency={currency} />
          )}
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
            selectedDay={row && sel !== row.trip.date ? row.date : sel}
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
              <div className="mt-6 hidden space-y-3 lg:block">
                {model.resume.day && <Button variant="primary" size="lg" className="w-full" pending={releasing} aria-label={RESUME_DAY_LABEL} onClick={() => resume([trip.date])}>Resume</Button>}
                <TripActions model={model} layout="card" onAction={setActive} onGoTo={goTo} hide={addressRow?.av.ok ? ["address"] : []} onPause={() => pauseDay(trip.date)} pausing={releasing} />
              </div>
            </EatingCard>
          ) : emptyDay ? (
            <p className="text-[15px] font-semibold">Nothing planned on {humanDate(emptyDay)}.</p>
          ) : null}
        </div>
      </div>

      {trip && model && (model.rows.length > 0 || model.goTo || model.resume.day) && (
        <div className={`${FONT} c-liquid fixed inset-x-3 bottom-[calc(var(--tabbar-h,4rem)+max(0.75rem,env(safe-area-inset-bottom))+0.5rem)] z-30 transition-[bottom] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none flex gap-1 rounded-full p-1 lg:hidden`}>
          {model.resume.day && (
            <Button variant="primary" size="lg" className="min-w-0 flex-1 whitespace-nowrap px-2" aria-label={RESUME_DAY_LABEL} pending={releasing} onClick={() => resume([trip.date])}>Resume</Button>
          )}
          <TripActions model={model} layout="bar" onAction={setActive} onGoTo={goTo} hide={addressRow?.av.ok ? ["address"] : []} onPause={() => pauseDay(trip.date)} pausing={releasing} />
        </div>
      )}
      </>
      )}

      {active && trip && !navigating && <ActionSheet action={active} trip={trip} day={row?.date} plan={plan} agenda={agenda} open onDone={done} onChanged={changed} />}
      {pauseOpen && <PauseSheet plan={plan} open onMove={moveDay} onDone={(message) => { setPauseOpen(false); if (message) changed(message); }} />}
      {info && <TripInfoSheet row={info} tz={tz} plan={plan} open onClose={() => setInfo(null)} />}
      <Toast open={toast !== null} onClose={closeToast}>{toast}</Toast>
    </div>
  );
}
