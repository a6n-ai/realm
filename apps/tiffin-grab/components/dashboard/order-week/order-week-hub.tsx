"use client";

import { zonedDateIso } from "@foundry/commons";
import { dropOffSummary } from "@/lib/catalog/drop-off";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Info, MapPin, Pencil, Truck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { cn } from "@foundry/ui/cn";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { setDeliveryStatusAction } from "@/app/(dashboard)/dashboard/orders/[id]/actions";
import { actionAvailability, humanDate, type Availability, type PlanContext, type Trip, type TripAction } from "@/lib/deliveries-view";
import { deliveryLine, eatingRowsInWeek, isAddressRow, moveNotes, tiffinBreakdown, weekdayShort, type EatingRow } from "@/lib/deliveries-view/eating";
import { addDays, dotStatus, mondayOf } from "@/lib/deliveries-view/week";
import type { OrderWeek } from "@/lib/services/order-week.service";
import { cutoffFmt, dedupeDishes, Journey, MealTiles, mealCategories, moveChips, rowMeta, tiffins } from "@/components/customer/deliveries/trip-parts";
import { OrderStatusBadge } from "@/components/ds";
import { TableCell } from "@foundry/ui/table";
import { PagedTable } from "./paged-table";
import { AddressSheet } from "@/components/customer/deliveries/actions/address-sheet";
import { MoveSheet } from "@/components/customer/deliveries/actions/move-sheet";
import { actionModel } from "@/components/customer/deliveries/action-model";
import { PickSheet } from "@/components/customer/deliveries/actions/pick-sheet";
import { ADMIN_SHEET_UI } from "./admin-sheet-ui";
import { WeekStrip } from "@/components/customer/deliveries/week-strip";
import { deliveryAddress } from "@/lib/deliveries-view/current-address";

type Dlg = "reschedule" | "info" | "address" | "pick" | null;
const rank = (t: Trip) => (t.status === "upcoming" ? 0 : t.status === "failed" ? 1 : 2);

export function OrderWeekHub({ data, canEditDeliveryStatus = false }: { data: OrderWeek; canEditDeliveryStatus?: boolean }) {
  const { plan, trips, agenda, weekStart, firstWeek, lastWeek, now } = data;
  const router = useRouter();
  const params = useSearchParams();
  const [nav, startNav] = useTransition();
  const [sel, setSel] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [wk, setWk] = useState(weekStart);
  if (wk !== weekStart) {
    setWk(weekStart);
    setSel(null);
  }

  const weekEnd = addDays(weekStart, 6);
  const rows = useMemo(() => eatingRowsInWeek(trips, weekStart, weekEnd), [trips, weekStart, weekEnd]);
  const row: EatingRow | null = (sel ? rows.find((r) => r.date === sel) ?? rows.find((r) => r.trip.date === sel) : null) ?? (sel ? null : [...rows].sort((a, b) => rank(a.trip) - rank(b.trip) || a.date.localeCompare(b.date))[0] ?? null);
  const trip = row?.trip ?? null;
  const editChoice = trip && canEditDeliveryStatus && trip.deliveryId ? statusChoice(trip) : null;
  const av = trip ? actionAvailability(trip, now, plan.ctx) : null;
  const tz = plan.ctx.timezone;

  const weekDaysOfPlan = plan.days.filter((x) => x.date >= weekStart && x.date <= weekEnd);
  const menuOut = weekDaysOfPlan.length > 0 && weekDaysOfPlan.every((x) => x.menuWeekId == null);
  // The selected week only; the header's Previous/Next walks the plan a week at a time.
  const scheduleRows = Object.entries(agenda)
    .filter(([date]) => date >= weekStart && date <= weekEnd)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, ds]) => ds.map((x) => ({ date, ...x })));
  // Keep ?tab (and anything else) so a week change never drops the admin back on Overview.
  const goWeek = (m: string, tripDate?: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("week", m);
    if (tripDate) sp.set("trip", tripDate);
    else sp.delete("trip");
    startNav(() => router.replace(`?${sp.toString()}`, { scroll: false }));
  };
  const done = (msg?: string) => {
    if (msg) toast.success(msg);
    setDlg(null);
    if (msg) router.refresh();
  };

  return (
    <div className={cn("space-y-4", nav && "opacity-60 transition-opacity")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <OrderStatusBadge status={plan.sub.displayStatus} />
        <span className="font-medium">{plan.sub.mealSizeName}</span>
        <span className="text-muted-foreground tabular-nums">
          {plan.counts.remaining} of {plan.counts.total} tiffins left
        </span>
      </div>

      <WeekStrip
        firstWeek={firstWeek}
        lastWeek={lastWeek}
        week={weekStart}
        today={plan.today}
        selectedDay={row?.date ?? sel}
        agenda={agenda}
        now={now}
        onPickDay={(iso) => (mondayOf(iso) === weekStart ? setSel(iso) : goWeek(mondayOf(iso), iso))}
        onWeek={(m) => goWeek(m)}
      />

      {menuOut && (
        <p data-testid="menu-not-released" className="text-muted-foreground text-sm"><span className="text-foreground font-medium">Menu not released yet.</span> Dish picks open once the kitchen releases this week&apos;s menu; days can still be moved or re-addressed.</p>
      )}

      {/* Same order as the customer's page: delivery (date, journey, moves), then meal and destination, then actions. */}
      {rows.length === 0 ? (
        <Card><CardContent className="text-muted-foreground py-6 text-sm">No eating days this week.</CardContent></Card>
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
          release={av.move}
          onDone={done}
          onOpen={setDlg}
        />
      ) : (
        <Card><CardContent className="text-muted-foreground py-6 text-sm">Nothing planned on {sel ? humanDate(sel) : "this day"}.</CardContent></Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            Eating days <span className="text-muted-foreground font-normal">· {humanDate(weekStart)} – {humanDate(weekEnd)}</span>
          </CardTitle>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" disabled={weekStart <= firstWeek} onClick={() => goWeek(addDays(weekStart, -7))}><ChevronLeft data-icon="inline-start" />Previous</Button>
            <Button variant="outline" size="sm" disabled={weekStart >= lastWeek} onClick={() => goWeek(addDays(weekStart, 7))}>Next<ChevronRight data-icon="inline-end" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          <PagedTable
            columns={[{ key: "day", label: "Eating day" }, { key: "delivery", label: "Delivery" }, { key: "id", label: "Delivery ID" }, { key: "tiffins", label: "Tiffins", className: "text-right" }, { key: "status", label: "Status" }]}
            rows={scheduleRows}
            rowKey={(x) => x.date}
            selected={(x) => x.date === row?.date}
            onRowClick={(x) => setSel(x.date)}
            empty="No eating days this week."
            renderRow={(x) => (
              <>
                <TableCell className="font-medium">{humanDate(x.date)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {x.truck ? <span className="inline-flex items-center gap-1.5"><Truck className="size-3.5" aria-hidden />Arrives {humanDate(x.deliveryDate)}</span> : x.moved ? `Moved to ${humanDate(x.deliveryDate)}` : `With ${humanDate(x.deliveryDate)} delivery`}
                  {x.truck && trips.find((t) => t.date === x.deliveryDate)?.addressOverride && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs" title="Sent to a different address than the plan"><MapPin className="size-3" aria-hidden />New address</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{x.truck ? x.deliveryId ?? "" : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{x.truck ? x.units : ""}</TableCell>
                <TableCell>
                  <EatingDayStatus
                    truck={x.truck}
                    moved={!!x.moved}
                    deliveryDate={x.deliveryDate}
                    dot={dotStatus(x, now)}
                    trips={trips}
                    now={now}
                    tz={tz}
                    ctx={plan.ctx}
                    canEdit={canEditDeliveryStatus}
                    onRelease={() => {
                      setSel(x.date);
                      setDlg("reschedule");
                    }}
                    onDone={done}
                  />
                </TableCell>
              </>
            )}
          />
        </CardContent>
      </Card>

      {dlg === "info" && row && <InfoDialog row={row} plan={plan} onClose={() => setDlg(null)} />}
      {/* The customer's own sheets, drawn in shadcn: one implementation of every rule. */}
      {dlg === "reschedule" && trip && <MoveSheet open trip={trip} plan={plan} agenda={agenda} day={row?.date} onDone={done} ui={ADMIN_SHEET_UI} />}
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
type StatusValue = "upcoming" | "delivered" | "on_hold" | "not_delivered" | "paused";

function statusChoice(trip: Trip): StatusValue | null {
  if (!trip.deliveryId || trip.mergedInto) return null;
  switch (trip.status) {
    case "combined-into":
    case "rescheduled":
    case "locked":
      return null;
    case "vacation":
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
  row, trip, plan, now, menuOut, weekStart, weekEnd, rows, tz, editChoice, release, onDone, onOpen,
}: {
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
  release: Availability;
  onDone: (message?: string) => void;
  onOpen: (d: Dlg) => void;
}) {
  const model = actionModel(trip, now, plan.ctx, {
    menuOut: menuOut && trip.date >= weekStart && trip.date <= weekEnd,
    isDeliveryDay: isAddressRow(rows, row),
    movedTo: row.movedTo,
    trial: plan.sub.trial,
  });
  const addressOk = model.rows.some((r) => r.key === "address" && r.av.ok);
  const carried = trip.date !== row.date;
  const meta = [
    carried ? `${trip.status === "delivered" ? "Came" : "Comes"} with the ${humanDate(trip.date)} delivery` : null,
    trip.status === "upcoming" && trip.cutoffAt ? `Changes until ${cutoffFmt(trip.cutoffAt, tz)}` : null,
  ].filter(Boolean).join(" · ");
  const chips = moveChips(row, true);
  const [first, ...rest] = dedupeDishes(row.dish);
  const addr = deliveryAddress(trip.addressOverride, plan.sub);
  const meals = mealCategories(row, plan);
  return (
    <Card data-testid="delivery-block">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">Delivery</p>
          <CardTitle className="text-2xl">{humanDate(row.date)}</CardTitle>
          {meta ? <p className="text-muted-foreground text-sm">{meta}</p> : null}
        </div>
        {editChoice && trip.deliveryId ? (
          <DeliveryStatusSelect deliveryId={trip.deliveryId} value={editChoice} cutoffPassed={trip.cutoffAt <= now} beforeDay={trip.date > zonedDateIso(now, tz)} release={release} onRelease={() => onOpen("reschedule")} onDone={onDone} />
        ) : (
          <Badge variant="outline">{rowMeta(row).label}</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {!row.movedTo && <div className="max-w-xl"><Journey status={trip.status} /></div>}
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-2" data-testid="delivery-pills">
            {chips.map((f) => <MoveBadge key={f.text} fact={f} />)}
          </div>
        ) : null}
        {!row.movedTo && (
          <div className="grid gap-6 border-t pt-5 sm:grid-cols-2">
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">Meal</p>
                <Button variant="ghost" size="icon" className="-my-2 size-7" aria-label={`Details for ${humanDate(row.date)}`} onClick={() => onOpen("info")}><Info /></Button>
              </div>
              {menuOut ? <p className="text-muted-foreground text-sm">Menu not released yet</p> : meals.length > 0 ? <MealTiles cats={meals} /> : (
                <ul className="space-y-0.5">
                  <li className="font-medium">{first ?? "Default menu"}</li>
                  {rest.map((d) => <li key={d} className="text-muted-foreground text-sm">{d}</li>)}
                </ul>
              )}
              {trip.status !== "failed" ? <p className="text-muted-foreground mt-1 text-sm">{tiffins(trip.units)}{trip.units > 1 ? ` (${tiffinBreakdown(trip)})` : ""}</p> : null}
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
        <div className="flex flex-wrap items-start justify-between gap-3 border-t pt-4">
          {/* The customer's own action model, so staff get exactly what the customer gets for this day. */}
          <Actions model={model} onOpen={onOpen} hide={addressOk ? ["address"] : []} held={editChoice === "on_hold"} />
        </div>
      </CardContent>
    </Card>
  );
}

function agendaLabel(dot: string, moved: boolean): string {
  if (moved) return "Moved";
  switch (dot) {
    case "delivered": return "Delivered";
    case "hold": return "On hold";
    case "vacation": return "Vacation";
    case "upcoming": return "Upcoming";
    default: return "Upcoming";
  }
}

function EatingDayStatus({
  truck, moved, deliveryDate, dot, trips, now, tz, ctx, canEdit, onRelease, onDone,
}: {
  tz: string;
  ctx: PlanContext;
  onRelease: () => void;
  truck: boolean;
  moved: boolean;
  deliveryDate: string;
  dot: string;
  trips: Trip[];
  now: number;
  canEdit: boolean;
  onDone: (message: string) => void;
}) {
  const tripRow = truck && !moved ? trips.find((t) => t.date === deliveryDate && t.deliveryId) : undefined;
  const choice = tripRow ? statusChoice(tripRow) : null;
  if (canEdit && tripRow?.deliveryId && choice) {
    return (
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <DeliveryStatusSelect deliveryId={tripRow.deliveryId} value={choice} cutoffPassed={tripRow.cutoffAt <= now} beforeDay={tripRow.date > zonedDateIso(now, tz)} release={actionAvailability(tripRow, now, ctx).move} onRelease={onRelease} onDone={onDone} />
      </div>
    );
  }
  return <Badge variant="outline">{agendaLabel(dot, moved)}</Badge>;
}

function DeliveryStatusSelect({
  deliveryId, value, cutoffPassed, beforeDay, release, onRelease, onDone,
}: {
  deliveryId: string;
  value: StatusValue;
  /** Whether a held tiffin can move yet: only after its day is over (midnight). */
  release?: Availability;
  onRelease: () => void;
  cutoffPassed: boolean;
  /** The delivery date hasn't come yet, so it can't have been delivered. */
  beforeDay: boolean;
  onDone: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmHold, setConfirmHold] = useState(false);
  const save = (next: "upcoming" | "delivered" | "not_delivered") =>
    startTransition(async () => {
      const res = await setDeliveryStatusAction(deliveryId, next);
      if ("error" in res) toast.error(res.error);
      else onDone(res.message ?? "Delivery status updated");
      setConfirmHold(false);
    });
  return (
    <>
      <Select
        value={value}
        disabled={pending}
        onValueChange={(next) => {
          if (next === value || next === "paused" || next === "not_delivered") return;
          // A hold never goes back to this day: releasing it means picking a new day.
          if (next === "release") return onRelease();
          if (next === "on_hold") {
            setConfirmHold(true);
            return;
          }
          if (next === "upcoming" || next === "delivered") save(next);
        }}
      >
        <SelectTrigger className="h-8 w-[10.5rem]" aria-label="Delivery status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {value === "on_hold" ? (
            <>
              <SelectItem value="on_hold">On hold</SelectItem>
              <SelectItem value="release" disabled={!release?.ok}>{release?.ok ? "Release hold…" : "Release hold (after midnight)"}</SelectItem>
            </>
          ) : (
            <>
              <SelectItem value="upcoming">{cutoffPassed ? "Awaiting confirmation" : "Upcoming"}</SelectItem>
              <SelectItem value="delivered" disabled={beforeDay}>Delivered</SelectItem>
              <SelectItem value="on_hold">On hold</SelectItem>
            </>
          )}
          {value === "not_delivered" ? <SelectItem value="not_delivered">Not delivered</SelectItem> : null}
          {value === "paused" ? <SelectItem value="paused">Paused</SelectItem> : null}
        </SelectContent>
      </Select>
      <Dialog open={confirmHold} onOpenChange={(o) => !pending && setConfirmHold(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Put this delivery on hold?</DialogTitle>
            <DialogDescription>This can&apos;t be undone. The tiffin won&apos;t go out this day. Release the hold later to give it a new delivery day.</DialogDescription>
          </DialogHeader>
          {cutoffPassed && (
            <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border p-3 text-sm">
              <p className="font-medium">Cutoff has passed</p>
              <p>The kitchen may have prepared this tiffin and the label may be printed. Tell the kitchen and driver. The tiffin stays on hold until midnight, once this day&apos;s deliveries are reconciled. Then use Release hold to give it a new day.</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={pending} onClick={() => setConfirmHold(false)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={() => save("not_delivered")}>Put on hold</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Actions({ model, onOpen, hide = [], held = false }: { model: ReturnType<typeof actionModel>; onOpen: (d: Dlg) => void; hide?: TripAction[]; held?: boolean }) {
  const rows = model.rows.filter((r) => !hide.includes(r.key));
  if (rows.length === 0) return model.closedReason ? <p className="text-muted-foreground text-sm">{model.closedReason}</p> : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <Button key={r.key} variant={r.key === model.primary ? "default" : "outline"} size="sm" disabled={!r.av.ok} onClick={() => onOpen(OPENS[r.key])}>
            {held && r.key === "move" ? "Release hold to a new day" : r.label}
          </Button>
        ))}
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
