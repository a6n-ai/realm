"use client";

import { zonedDateIso } from "@foundry/commons";
import { dropOffSummary } from "@/lib/catalog/drop-off";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Info, MapPin, Pencil } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { cn } from "@foundry/ui/cn";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { pauseMyDays, releaseMyDays } from "@/app/(customer)/me/deliveries/actions";
import { actionAvailability, humanDate, type Trip, type TripAction } from "@/lib/deliveries-view";
import { dayNote, deliveryLine, eatingRowsInWeek, isAddressRow, moveNotes, weekdayShort, type EatingRow } from "@/lib/deliveries-view/eating";
import { addDays, mondayOf, pausedAhead, pausedPast } from "@/lib/deliveries-view/week";
import type { OrderWeek } from "@/lib/services/order-week.service";
import { dedupeDishes, MealTiles, mealCategories, moveChips, rowMeta, splitMealAddons, tiffins } from "@/components/customer/deliveries/trip-parts";
import { OrderStatusBadge } from "@/components/ds";
import { boxStatus, OrderMonthCalendar } from "./order-month-calendar";
import { DeliveryStepper } from "./delivery-stepper";
import { DeliveryStatusCard, type StatusValue } from "./delivery-status-card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";
import { RouteControls, type OptimoRouteRow } from "@/app/(dashboard)/dashboard/orders/[id]/optimoroute-panel";
import { AddressSheet } from "@/components/customer/deliveries/actions/address-sheet";
import { MoveSheet } from "@/components/customer/deliveries/actions/move-sheet";
import { actionModel, PAUSE_DAY_LABEL, RESUME_ALL_LABEL, RESUME_DAY_LABEL } from "@/components/customer/deliveries/action-model";
import { pausedLine, resumeLine } from "@/components/customer/deliveries/pause-copy";
import { PickSheet } from "@/components/customer/deliveries/actions/pick-sheet";
import { ADMIN_SHEET_UI } from "./admin-sheet-ui";
import { PauseSheet } from "@/components/customer/deliveries/actions/pause-sheet";
import { deliveryAddress } from "@/lib/deliveries-view/current-address";

type Dlg = "reschedule" | "info" | "address" | "pick" | null;
const rank = (t: Trip) => (t.status === "upcoming" ? 0 : t.status === "failed" ? 1 : 2);

// readOnly: a finished plan, or one under payment review, shows every day with no way to change one.
export function OrderWeekHub({ data, canEditDeliveryStatus = false, readOnly = false, routing = [] }: { data: OrderWeek; canEditDeliveryStatus?: boolean; readOnly?: boolean; routing?: OptimoRouteRow[] }) {
  if (readOnly) canEditDeliveryStatus = false;
  const { plan, trips, agenda, weekStart, now } = data;
  const router = useRouter();
  const params = useSearchParams();
  const [nav, startNav] = useTransition();
  // ?trip and ?action=move survive the data refresh after a resume, which can remount this view.
  const [sel, setSel] = useState<string | null>(() => params.get("trip"));
  const [dlg, setDlg] = useState<Dlg>(() => (params.get("action") === "move" ? "reschedule" : null));
  const [resumeAsk, setResumeAsk] = useState(false);
  const [resumingAll, startResumeAll] = useTransition();
  const [pauseOpen, setPauseOpen] = useState(false);
  const [wk, setWk] = useState(weekStart);
  if (wk !== weekStart) {
    setWk(weekStart);
    // goWeek carries the day to land on in ?trip.
    setSel(params.get("trip"));
  }

  const weekEnd = addDays(weekStart, 6);
  const rows = useMemo(() => eatingRowsInWeek(trips, weekStart, weekEnd), [trips, weekStart, weekEnd]);
  const row: EatingRow | null = (sel ? rows.find((r) => r.date === sel) ?? rows.find((r) => r.trip.date === sel) : null) ?? (sel ? null : [...rows].sort((a, b) => rank(a.trip) - rank(b.trip) || a.date.localeCompare(b.date))[0] ?? null);
  const trip = row?.trip ?? null;
  const editChoice = trip && canEditDeliveryStatus && trip.deliveryId ? statusChoice(trip) : null;
  const av = trip ? actionAvailability(trip, now, plan.ctx) : null;
  const tz = plan.ctx.timezone;
  // The eating day the panel shows; a carried day names its own date, not the delivery that brings it.
  const selectedDay = row && sel !== row.trip.date ? row.date : sel ?? row?.date ?? null;

  const weekDaysOfPlan = plan.days.filter((x) => x.date >= weekStart && x.date <= weekEnd);
  const menuOut = weekDaysOfPlan.length > 0 && weekDaysOfPlan.every((x) => x.menuWeekId == null);
  // Keep ?tab (and anything else) so a week change never drops the admin back on Overview.
  const goWeek = (m: string, tripDate?: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("week", m);
    if (tripDate) sp.set("trip", tripDate);
    else sp.delete("trip");
    startNav(() => router.replace(`?${sp.toString()}`, { scroll: false }));
  };
  const pickDay = (iso: string) => (mondayOf(iso) === weekStart ? setSel(iso) : goWeek(mondayOf(iso), iso));
  // From the pause drawer: go to that paused day (any week) and open Move on it.
  const moveDay = (iso: string) => {
    setPauseOpen(false);
    pickDay(iso);
    setDlg("reschedule");
  };
  const done = (msg?: string) => {
    if (msg) toast.success(msg);
    setDlg(null);
    // A sheet opened from ?action= must not reopen when the page data refreshes.
    if (new URLSearchParams(window.location.search).has("action")) {
      const sp = new URLSearchParams(window.location.search);
      sp.delete("action");
      window.history.replaceState(null, "", `?${sp.toString()}`);
    }
    if (msg) router.refresh();
  };
  // Plan-wide resume. A paused day past its cutoff can't come back: say so first, so its tiffin isn't forgotten.
  // Delivery days whose date has come but nobody has confirmed: the first thing staff should settle.
  const waiting = Object.entries(agenda)
    .filter(([date, ds]) => date <= plan.today && ds.some((d) => d.truck && boxStatus(d, now) === "awaiting"))
    .map(([date]) => date)
    .sort();
  // The banner walks the list: the first waiting day other than the one already open.
  const nextWaiting = waiting.find((d) => d !== selectedDay) ?? null;
  const ahead = pausedAhead(agenda, now);
  const missed = pausedPast(agenda, now);
  const canResumeAll = ahead > 0 || missed.length > 0;
  const releaseAll = async () => {
    const res = await releaseMyDays(plan.orderId, "all");
    const line = "error" in res ? null : resumeLine(res.dates, res.reclosed);
    if ("error" in res) toast.error(res.error);
    else if (line) toast.success(line);
    else toast.error("Nothing was resumed.");
  };
  const resumeAll = () => (missed.length > 0 ? setResumeAsk(true) : startResumeAll(async () => { await releaseAll(); router.refresh(); }));
  const resumeRest = () => startResumeAll(async () => { setResumeAsk(false); await releaseAll(); router.refresh(); });
  const resumeThenMove = (date: string) => startResumeAll(async () => {
    setResumeAsk(false);
    await releaseAll();
    setSel(date);
    setDlg("reschedule");
    const sp = new URLSearchParams(params.toString());
    sp.set("week", mondayOf(date));
    sp.set("trip", date);
    sp.set("action", "move");
    startNav(() => router.replace(`?${sp.toString()}`, { scroll: false }));
  });

  return (
    <div className={cn("flex flex-col gap-4", nav && "opacity-60 transition-opacity")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <OrderStatusBadge status={plan.sub.displayStatus} />
        {plan.sub.fullyPaused && <Badge variant="outline">All upcoming days paused</Badge>}
        <span className="font-medium">{plan.sub.mealSizeName}</span>
        <span className="text-muted-foreground tabular-nums">
          {plan.counts.remaining} of {plan.counts.total} tiffins left
        </span>
        {!plan.sub.trial && !readOnly && (
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" onClick={() => setPauseOpen(true)}>Pause multiple days</Button>
            <Button type="button" variant="outline" disabled={!canResumeAll || resumingAll} title={canResumeAll ? undefined : "No paused days to resume."} onClick={resumeAll}>{RESUME_ALL_LABEL}</Button>
          </div>
        )}
      </div>

      {canEditDeliveryStatus && waiting.length > 0 && (
        <div data-testid="needs-action" className="border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
          <span><span className="font-medium">{waiting.length === 1 ? "1 delivery is" : `${waiting.length} deliveries are`} waiting for confirmation.</span> Mark each one delivered or not delivered.</span>
          {nextWaiting && <Button type="button" variant="outline" size="sm" onClick={() => pickDay(nextWaiting)}>Show {humanDate(nextWaiting)}</Button>}
        </div>
      )}
      {menuOut && (
        <p data-testid="menu-not-released" className="bg-muted/50 text-muted-foreground rounded-lg border px-3 py-2 text-sm"><span className="text-foreground font-medium">Menu not released yet.</span> Dish picks open once the kitchen releases this week&apos;s menu; days can still be moved or re-addressed.</p>
      )}

      {/* One navigator (the month), one selected day beside it with everything that changes it; aligned edges, equal height. */}
      <div className="grid items-stretch gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="bg-card flex min-h-[600px] min-w-0 flex-col rounded-xl border p-3">
          <OrderMonthCalendar agenda={agenda} focus={selectedDay ?? weekStart} selectedDay={selectedDay} now={now} onPickDay={pickDay} />
        </div>
        <div className="flex min-w-0 flex-col [&>*]:flex-1">
          {rows.length === 0 ? (
            <Card><CardContent className="text-muted-foreground py-6 text-sm">No eating days this week. Pick a day on the calendar.</CardContent></Card>
          ) : row && trip && av ? (
            <SelectedDelivery
              row={row}
              trip={trip}
              plan={plan}
              now={now}
              menuOut={menuOut}
              weekStart={weekStart}
              weekEnd={weekEnd}
              rows={rows}
              tz={tz}
              editChoice={editChoice}
              readOnly={readOnly}
              routing={routing}
              onDone={(m) => { setSel(row.date); done(m); }}
              onOpen={setDlg}
            />
          ) : (
            <Card><CardContent className="text-muted-foreground py-6 text-sm">Nothing planned on {sel ? humanDate(sel) : "this day"}. Pick a day on the calendar.</CardContent></Card>
          )}
        </div>
      </div>

      {resumeAsk && missed[0] && (
      <Dialog open onOpenChange={(o) => !o && setResumeAsk(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{missed.length === 1 ? "One paused day can't be resumed" : `${missed.length} paused days can't be resumed`}</DialogTitle>
            <DialogDescription>
              {missed.map(humanDate).join(", ")} {missed.length === 1 ? "is" : "are"} past cutoff, so {missed.length === 1 ? "it" : "they"} can&apos;t go out on {missed.length === 1 ? "that date" : "those dates"}. Move {missed.length === 1 ? "it" : "each one"} to another day so the customer doesn&apos;t miss {missed.length === 1 ? "that tiffin" : "those tiffins"}.{ahead > 0 ? " The other paused days will be resumed." : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {ahead > 0 ? (
              <>
                <Button variant="outline" onClick={resumeRest}>Only resume the rest</Button>
                <Button onClick={() => resumeThenMove(missed[0]!)}>Resume the rest, then move {humanDate(missed[0])}</Button>
              </>
            ) : (
              <Button onClick={() => (setResumeAsk(false), moveDay(missed[0]!))}>Move {humanDate(missed[0])}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
      {dlg === "info" && row && <InfoDialog row={row} plan={plan} onClose={() => setDlg(null)} />}
      {pauseOpen && <PauseSheet plan={plan} open ui={ADMIN_SHEET_UI} onMove={moveDay} onDone={(message) => { setPauseOpen(false); done(message); }} />}
      {/* The customer's own sheets, drawn in shadcn: one implementation of every rule. */}
      {dlg === "reschedule" && trip && !nav && <MoveSheet open trip={trip} plan={plan} agenda={agenda} day={row?.date} onDone={done} ui={ADMIN_SHEET_UI} />}
      {dlg === "address" && trip && <AddressSheet open trip={trip} plan={plan} onDone={done} ui={ADMIN_SHEET_UI} />}
      {dlg === "pick" && row && trip && (
        <PickSheet
          open
          trip={trip}
          plan={plan}
          day={row.date}
          onDone={done}
          onChanged={(m) => {
            toast.success(m);
            router.refresh();
          }}
          ui={ADMIN_SHEET_UI}
        />
      )}
    </div>
  );
}

const OPENS: Record<TripAction, Dlg> = { pick: "pick", move: "reschedule", address: "address", swap: "pick" };

// "not_delivered" only comes from OptimoRoute (driver marked the drop failed); staff put a day
// "on_hold", which the server stores the same way (skipped, tiffin back to the pool).

function statusChoice(trip: Trip): StatusValue | null {
  // A holiday-closed day is placed or moved, never set to a status: the server refuses Upcoming on it.
  if (!trip.deliveryId || trip.mergedInto || trip.holidayName) return null;
  switch (trip.status) {
    case "combined-into":
    case "rescheduled":
    case "holiday":
    case "locked":
      return null;
    case "paused":
      return "paused";
    case "failed":
      return trip.optimoCompletionStatus === "failed" ? "not_delivered" : "on_hold";
    case "delivered":
      return "delivered";
    // Not confirmed by OptimoRoute or an admin yet: Upcoming before the cutoff, Awaiting confirmation after.
    case "unconfirmed":
    case "cutoff-passed":
    case "upcoming":
      return "upcoming";
    default: {
      const unreachable: never = trip.status;
      return unreachable;
    }
  }
}

function SelectedDelivery({
  row, trip, plan, now, menuOut, weekStart, weekEnd, rows, tz, editChoice, readOnly, routing, onDone, onOpen,
}: {
  routing: OptimoRouteRow[];
  row: EatingRow;
  trip: Trip;
  plan: OrderWeek["plan"];
  now: number;
  menuOut: boolean;
  weekStart: string;
  weekEnd: string;
  rows: EatingRow[];
  tz: string;
  editChoice: StatusValue | null;
  readOnly: boolean;
  onDone: (message?: string) => void;
  onOpen: (d: Dlg) => void;
}) {
  const [resuming, startResume] = useTransition();
  const model = actionModel(trip, now, plan.ctx, {
    menuOut: menuOut && trip.date >= weekStart && trip.date <= weekEnd,
    isDeliveryDay: isAddressRow(rows, row),
    movedTo: row.movedTo,
    trial: plan.sub.trial,
  });
  const resume = (dates: string[] | "all") => startResume(async () => {
    const res = await releaseMyDays(plan.orderId, dates);
    const line = "error" in res ? null : resumeLine(res.dates, res.reclosed);
    if ("error" in res) toast.error(res.error);
    else if (line) onDone(line);
    else toast.error("Nothing was resumed.");
  });
  const pauseDay = () => startResume(async () => {
    const res = await pauseMyDays(plan.orderId, [trip.date]);
    if ("error" in res) toast.error(res.error);
    else if (res.paused.length === 0) toast.error("Nothing was paused. That day is past its cutoff.");
    else onDone(pausedLine(res.paused, res.skipped));
  });
  const addressOk = !readOnly && model.rows.some((r) => r.key === "address" && r.av.ok);
  const carried = trip.date !== row.date;
  const meta = [
    carried ? `${trip.status === "delivered" ? "Came" : "Comes"} with the ${humanDate(trip.date)} delivery` : null,
  ].filter(Boolean).join(" · ");
  const chips = moveChips(row, true);
  const note = dayNote(row, true);
  const [first, ...rest] = dedupeDishes(row.dish);
  const addr = deliveryAddress(trip.addressOverride, plan.sub);
  const { meal: meals, addons: addonTiles } = splitMealAddons(mealCategories(row, plan), plan.sub.addons);
  return (
    <Card data-testid="delivery-block">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">Delivery</p>
          <CardTitle className="text-2xl">{humanDate(row.date)}</CardTitle>
          {meta ? <p className="text-muted-foreground text-sm">{meta}</p> : null}
          {trip.complimentaryNote != null && (
            <p className="text-sm" data-testid="complimentary-note">
              <Badge className="mr-2">Free tiffin</Badge>
              <span className="text-muted-foreground">{trip.complimentaryNote}</span>
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!row.movedTo && <DeliveryStepper trip={trip} now={now} tz={tz} driver={routing.find((r) => r.publicId === trip.deliveryId)?.routeDriverName} />}
        <DeliveryStatusCard
          deliveryId={trip.deliveryId}
          value={editChoice && trip.deliveryId ? editChoice : null}
          fallbackLabel={rowMeta(row).label}
          detail={note.length > 0 ? (
            <div className="space-y-0.5 break-words text-sm" data-testid="holiday-note">
              {note.map((l) => <p key={l}>{l}</p>)}
            </div>
          ) : null}
          trip={trip}
          now={now}
          beforeDay={trip.date > zonedDateIso(now, tz)}
          onDone={onDone}
        >
          {/* The customer's own action model, so staff get exactly what the customer gets for this day. */}
          {!readOnly && <Actions model={model} onOpen={onOpen} hide={addressOk ? ["address"] : []} held={editChoice === "on_hold"} quietClosed={editChoice != null} resuming={resuming} onResume={() => resume([trip.date])} onPause={pauseDay} />}
        </DeliveryStatusCard>
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-2" data-testid="delivery-pills">
            {chips.map((f) => <MoveBadge key={f.text} fact={f} />)}
          </div>
        ) : null}
        {!row.movedTo && !trip.holidayName && (
          <div className="grid gap-6 border-t pt-5">
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">Meal</p>
                <Button variant="ghost" size="icon" className="-my-2 size-7" aria-label={`Details for ${humanDate(row.date)}`} onClick={() => onOpen("info")}><Info /></Button>
              </div>
              {menuOut ? <p className="text-muted-foreground text-sm">Menu not released yet</p> : meals.length > 0 ? (
                <>
                  <MealTiles cats={meals} />
                  {addonTiles.length > 0 && (
                    <>
                      <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">Add-ons</p>
                      <MealTiles cats={addonTiles} />
                    </>
                  )}
                </>
              ) : (
                <ul className="space-y-0.5">
                  <li className="font-medium">{first ?? "Default menu"}</li>
                  {rest.map((d) => <li key={d} className="text-muted-foreground text-sm">{d}</li>)}
                </ul>
              )}
              {trip.status !== "failed" ? <p className="text-muted-foreground mt-1 text-sm">{tiffins(trip.units)}</p> : null}
            </section>
            <section>
              <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">Destination</p>
              <p className="flex items-center gap-2 text-sm" data-testid="delivery-address">
                <MapPin className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">{addr.text}{addr.changed ? " (this delivery only)" : ""}</span>
                {addressOk ? <Button variant="ghost" size="sm" aria-label="Change address" onClick={() => onOpen("address")}><Pencil data-icon="inline-start" />Edit</Button> : null}
              </p>
            </section>
          </div>
        )}
        {trip.deliveryId ? <DeliveryMore orderId={plan.orderId} deliveryId={trip.deliveryId} route={routing.find((r) => r.publicId === trip.deliveryId)} /> : null}
      </CardContent>
    </Card>
  );
}

// Rare tools, one level down: the delivery's ID and the OptimoRoute fallback for a sync that went wrong.
function DeliveryMore({ orderId, deliveryId, route }: { orderId: string; deliveryId: string; route?: OptimoRouteRow }) {
  return (
    <Collapsible className="border-t pt-3">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="group -ml-2">
          More
          <ChevronDown data-icon="inline-end" className="transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 pt-2">
        <p className="text-muted-foreground text-sm">
          Delivery ID <span className="text-foreground font-mono text-xs" data-testid="delivery-id">{deliveryId}</span>
        </p>
        {route ? <RouteControls orderId={orderId} row={route} /> : <p className="text-muted-foreground text-sm">Routing: only upcoming deliveries can be pushed to OptimoRoute.</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}

// quietClosed: the status card above already says why nothing can change, so don't repeat it.
function Actions({ model, onOpen, hide = [], held = false, quietClosed = false, resuming = false, onResume, onPause }: { model: ReturnType<typeof actionModel>; onOpen: (d: Dlg) => void; hide?: TripAction[]; held?: boolean; quietClosed?: boolean; resuming?: boolean; onResume?: () => void; onPause?: () => void }) {
  const rows = model.rows.filter((r) => !hide.includes(r.key));
  if (rows.length === 0 && !model.resume.day) return model.closedReason && !quietClosed ? <p className="text-muted-foreground text-sm">{model.closedReason}</p> : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {model.resume.day && <Button size="sm" disabled={resuming} onClick={onResume}>{RESUME_DAY_LABEL}</Button>}
        {rows.map((r) => (
          <Button key={r.key} variant={r.key === model.primary ? "default" : "outline"} size="sm" disabled={!r.av.ok} onClick={() => onOpen(OPENS[r.key])}>
            {held && r.key === "move" ? "Release hold to a new day" : r.label}
          </Button>
        ))}
        {model.pause && <Button size="sm" variant="outline" disabled={resuming} onClick={onPause}>{PAUSE_DAY_LABEL}</Button>}
      </div>
      {rows.filter((r) => !r.av.ok).map((r) => <p key={r.key} className="text-muted-foreground text-xs">{r.label}: {r.av.why}</p>)}
    </div>
  );
}

function InfoDialog({ row, plan, onClose }: { row: EatingRow; plan: OrderWeek["plan"]; onClose: () => void }) {
  const t = row.trip;
  const source = plan.days.find((x) => x.date === t.date);
  const meal = row.own ? source?.meal : source?.carriedMeals?.[row.date];
  const cats = (meal ?? []).filter((c) => c.picks.length > 0);
  const slotPortion = (category: string, pickIndex: number): string | null => {
    const swapped = plan.portionsByDate?.[row.date]?.[category];
    if (swapped?.length) return swapped[pickIndex] ?? swapped[swapped.length - 1] ?? null;
    const slots = plan.categoryPortionSlots?.[category];
    if (slots?.length) return slots[pickIndex] ?? slots[slots.length - 1] ?? null;
    return plan.categoryPortions[category] ?? null;
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{humanDate(row.date)} · meal</DialogTitle><DialogDescription>{[deliveryLine(row), `${tiffins(t.units)} covering ${t.coversDates.map(weekdayShort).join(" + ")}`, ...moveNotes(row, true)].filter(Boolean).join(" · ")}</DialogDescription></DialogHeader>
        {(t.addressOverride || t.dropOff?.tagId) && (
          <div className="rounded-md border p-3 text-sm space-y-1">
            <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider block mb-2">Delivery Override</span>
            {t.dropOff?.tagId && (
              <p>Drop-off: <span className="font-medium">{dropOffSummary(plan.dropOff, t.dropOff) || "No longer offered"}</span></p>
            )}
            {t.addressOverride && (
              <p>Address: <span className="font-medium">{t.addressOverride.addressLine}, {t.addressOverride.postalCode}</span></p>
            )}
          </div>
        )}
        {cats.length > 0 ? (
          <ul className="divide-y rounded-md border text-sm" aria-label="Meal">
            {cats.map((c) => (
              <li key={c.category} className="px-3 py-2.5">
                <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">{c.label}</span>
                {c.picks.map((p, i) => {
                  const oz = slotPortion(c.category, i);
                  return (
                    <div key={`${p.dishPublicId}-${i}`} className="font-medium">
                      {p.name}
                      {oz ? <span className="text-muted-foreground font-normal"> · {oz}</span> : null}
                      {p.isDefaulted && c.selectable && <span className="text-muted-foreground ml-2 text-xs font-normal">default pick</span>}
                    </div>
                  );
                })}
              </li>
            ))}
          </ul>
        ) : <p className="text-muted-foreground text-sm">{row.dish ?? "Default menu."}</p>}
      </DialogContent>
    </Dialog>
  );
}

// Same highlight as the customer's pills: count blue, moved-in brand orange, moved-out muted.
const PILL = {
  count: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300",
  in: "border-transparent bg-orange-500/15 text-orange-700 dark:text-orange-300",
  out: "border-transparent bg-muted text-muted-foreground",
} as const;

/** Moved-in / moved-out fact as a badge; wraps instead of overflowing the panel. */
function MoveBadge({ fact }: { fact: { kind: "in" | "out"; text: string } }) {
  const Icon = fact.kind === "in" ? ArrowDownLeft : ArrowUpRight;
  return (
    <Badge className={cn(PILL[fact.kind], "h-auto whitespace-normal text-left")}>
      <Icon aria-hidden />
      {fact.text}
    </Badge>
  );
}
