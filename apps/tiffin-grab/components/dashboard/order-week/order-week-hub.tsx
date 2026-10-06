/* eslint-disable */
"use client";

import { zonedDateIso } from "@foundry/commons";
import { dropOffSummary } from "@/lib/catalog/drop-off";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Info, MapPin, Package, Truck, Utensils } from "lucide-react";
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
import { actionAvailability, formatCutoff, humanDate, type Trip, type TripAction } from "@/lib/deliveries-view";
import { deliveryLine, eatingRowsInWeek, isAddressRow, moveFacts, moveNotes, moveTags, tiffinBreakdown, weekdayShort, type EatingRow, type MoveFact } from "@/lib/deliveries-view/eating";
import { addDays, dotStatus, mondayOf } from "@/lib/deliveries-view/week";
import type { OrderWeek } from "@/lib/services/order-week.service";
import { movedFact, rowMeta, tiffins } from "@/components/customer/deliveries/trip-parts";
import { OrderStatusBadge } from "@/components/ds";
import { TableCell } from "@foundry/ui/table";
import { PagedTable } from "./paged-table";
import { AddressSheet } from "@/components/customer/deliveries/actions/address-sheet";
import { MoveSheet } from "@/components/customer/deliveries/actions/move-sheet";
import { actionModel } from "@/components/customer/deliveries/action-model";
import { PickSheet } from "@/components/customer/deliveries/actions/pick-sheet";
import { ADMIN_SHEET_UI, STATUS_TONE } from "./admin-sheet-ui";
import { WeekTimeline } from "@/components/customer/deliveries/week-timeline";
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
  if (wk !== weekStart) (setWk(weekStart), setSel(null));

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
  const done = (msg?: string) => (msg ? (toast.success(msg), setDlg(null), router.refresh()) : setDlg(null));
  const nextTruck = Object.values(agenda).flat().filter((x) => x.truck && x.status === "scheduled" && x.deliveryDate >= plan.today).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))[0];

  return (
    <div className={cn("space-y-4", nav && "opacity-60 transition-opacity")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <OrderStatusBadge status={plan.sub.displayStatus} />
        <span className="font-medium">{plan.sub.mealSizeName}</span>
        <span className="text-muted-foreground tabular-nums">
          {plan.counts.remaining} of {plan.counts.total} tiffins left
        </span>
      </div>

      {nextTruck && (
        <Card className="py-3">
          <CardContent className="flex items-center gap-2 text-sm">
            <Truck className="size-4" aria-hidden />
            <span data-testid="next-delivery">
              Next delivery: <b>{humanDate(nextTruck.deliveryDate)}</b>, {tiffins(nextTruck.units)} ({nextTruck.covers.map(weekdayShort).join(" + ")}) · changes {nextTruck.cutoffAt <= now ? "closed" : "close"} {formatCutoff(nextTruck.cutoffAt, tz)}
            </span>
          </CardContent>
        </Card>
      )}

      <WeekTimeline
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
        <Card data-testid="menu-not-released" className="py-3"><CardContent className="space-y-0.5"><p className="text-sm font-medium">Menu not released yet.</p><p className="text-muted-foreground text-sm">Dish picks and swaps open once the kitchen releases this week&apos;s menu. Days can still be moved or re-addressed.</p></CardContent></Card>
      )}
      {rows.length === 0 ? (
        <Card><CardContent className="text-muted-foreground py-6 text-sm">No eating days this week.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <div className="space-y-1" role="list" aria-label="Eating days">
            {rows.map((r) => {
              const m = rowMeta(r);
              const on = row?.date === r.date;
              return (
                <div key={r.date} role="listitem" className="flex items-center">
                  <button type="button" data-testid="trip-row" aria-pressed={on} onClick={() => setSel(r.date)} className={cn("flex min-w-0 flex-1 items-start gap-3 rounded-md px-3 py-2 text-left", on ? "bg-muted" : "hover:bg-muted/60")}>
                    <Utensils aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="whitespace-nowrap text-sm font-medium">{humanDate(r.date)}</span>
                        <Badge variant="outline">{m.label}</Badge>
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">{r.movedTo ? `Moved to ${humanDate(r.movedTo)}` : menuOut ? "Menu not released yet" : r.dish ?? "Default menu"}</span>
                      {!r.movedTo && r.trip.status !== "failed" && (r.own || moveTags(r).length > 0) && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {r.own && <Badge className={PILL.count}>{tiffins(r.trip.units)}</Badge>}
                          {moveTags(r).map((t) => <MoveBadge key={t.kind} fact={t} />)}
                        </span>
                      )}
                    </span>
                  </button>
                  <Button variant="ghost" size="icon" aria-label={`Details for ${humanDate(r.date)}`} onClick={() => (setSel(r.date), setDlg("info"))}><Info /></Button>
                </div>
              );
            })}
          </div>

          {row && trip && av && (
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2" data-testid="delivery-block">
                  <Truck className="size-5" aria-hidden />
                  {deliveryLine(row)}
                  {editChoice && trip.deliveryId ? (
                    <DeliveryStatusSelect deliveryId={trip.deliveryId} value={editChoice} cutoffPassed={trip.cutoffAt <= now} beforeDay={trip.date > zonedDateIso(now, tz)} onDone={done} />
                  ) : (
                    <Badge variant="outline">{rowMeta(row).label}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {row.movedTo ? <p className="text-muted-foreground text-sm">{movedFact(row)}</p> : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2" data-testid="delivery-pills">
                      {trip.status !== "failed" && (
                        <Badge className={PILL.count}><Package aria-hidden />{tiffins(trip.units)} {trip.status === "delivered" ? "delivered" : "on this delivery"}: {tiffinBreakdown(trip)}</Badge>
                      )}
                      {moveFacts(row, true).map((f) => <MoveBadge key={f.kind} fact={f} />)}
                    </div>
                    <ul className="text-muted-foreground list-disc space-y-0.5 pl-5 text-sm">
                      {trip.status === "upcoming" && <li>Changes close {formatCutoff(trip.cutoffAt, tz)}</li>}
                      {!row.own && trip.status === "upcoming" && <li>{humanDate(row.date)} locks with {weekdayShort(trip.date)}&apos;s delivery</li>}
                    </ul>
                  </div>
                )}
                {!row.movedTo && (() => {
                  const addr = deliveryAddress(trip.addressOverride, plan.sub);
                  return (
                    <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="delivery-address">
                      <MapPin className="text-muted-foreground size-4 shrink-0" aria-hidden />
                      <span>Delivers to <span className="font-medium">{addr.text}</span></span>
                      {addr.changed && <Badge variant="secondary">This delivery only</Badge>}
                    </p>
                  );
                })()}
                {/* The customer's own action model, so staff get exactly what the customer gets for this day. */}
                <Actions model={actionModel(trip, now, plan.ctx, { menuOut: menuOut && trip.date >= weekStart && trip.date <= weekEnd, isDeliveryDay: isAddressRow(rows, row), movedTo: row.movedTo, trial: plan.sub.trial })} onOpen={setDlg} />
              </CardContent>
            </Card>
          )}
        </div>
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
                    canEdit={canEditDeliveryStatus}
                    onDone={done}
                  />
                </TableCell>
              </>
            )}
          />
        </CardContent>
      </Card>

      {dlg === "info" && row && <InfoDialog row={row} plan={plan} tz={tz} onClose={() => setDlg(null)} />}
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
          onChanged={(m) => (toast.success(m), router.refresh())}
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
  truck, moved, deliveryDate, dot, trips, now, tz, canEdit, onDone,
}: {
  tz: string;
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
        <DeliveryStatusSelect deliveryId={tripRow.deliveryId} value={choice} cutoffPassed={tripRow.cutoffAt <= now} beforeDay={tripRow.date > zonedDateIso(now, tz)} onDone={onDone} />
      </div>
    );
  }
  return <Badge variant="outline">{agendaLabel(dot, moved)}</Badge>;
}

function DeliveryStatusSelect({
  deliveryId, value, cutoffPassed, beforeDay, onDone,
}: {
  deliveryId: string;
  value: StatusValue;
  cutoffPassed: boolean;
  /** The delivery date hasn't come yet, so it can't have been delivered. */
  beforeDay: boolean;
  onDone: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(next) => {
        if (next === value || next === "paused" || next === "not_delivered") return;
        startTransition(async () => {
          const res = await setDeliveryStatusAction(deliveryId, next === "on_hold" ? "not_delivered" : next);
          if ("error" in res) toast.error(res.error);
          else onDone(res.message ?? "Delivery status updated");
        });
      }}
    >
      <SelectTrigger className="h-8 w-[10.5rem]" aria-label="Delivery status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="upcoming">{cutoffPassed ? "Awaiting confirmation" : "Upcoming"}</SelectItem>
        <SelectItem value="delivered" disabled={beforeDay}>Delivered</SelectItem>
        <SelectItem value="on_hold">On hold</SelectItem>
        {value === "not_delivered" ? <SelectItem value="not_delivered">Not delivered</SelectItem> : null}
        {value === "paused" ? <SelectItem value="paused">Paused</SelectItem> : null}
      </SelectContent>
    </Select>
  );
}

function Actions({ model, onOpen }: { model: ReturnType<typeof actionModel>; onOpen: (d: Dlg) => void }) {
  if (model.rows.length === 0) return model.closedReason ? <p className="text-muted-foreground text-sm">{model.closedReason}</p> : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {model.rows.map((r) => (
          <Button key={r.key} variant={r.key === model.primary ? "default" : "outline"} size="sm" disabled={!r.av.ok} onClick={() => onOpen(OPENS[r.key])}>
            {r.label}
          </Button>
        ))}
      </div>
      {model.rows.filter((r) => !r.av.ok).map((r) => <p key={r.key} className="text-muted-foreground text-xs">{r.label}: {r.av.why}</p>)}
    </div>
  );
}

function InfoDialog({ row, plan, tz, onClose }: { row: EatingRow; plan: OrderWeek["plan"]; tz: string; onClose: () => void }) {
  const t = row.trip;
  const source = plan.days.find((x) => x.date === t.date);
  const meal = row.own ? source?.meal : source?.carriedMeals?.[row.date];
  const cats = (meal ?? []).filter((c) => c.picks.length > 0);
  const slotPortion = (category: string, pickIndex: number): string | null => {
    const slots = plan.categoryPortionSlots?.[category];
    if (slots?.length) return slots[pickIndex] ?? slots[slots.length - 1] ?? null;
    return plan.categoryPortions[category] ?? null;
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{humanDate(row.date)} · meal</DialogTitle><DialogDescription>{[deliveryLine(row), `${tiffins(t.units)} covering ${t.coversDates.map(weekdayShort).join(" + ")}`, ...moveNotes(row, true), t.status === "upcoming" ? `changes close ${formatCutoff(t.cutoffAt, tz)}` : null].filter(Boolean).join(" · ")}</DialogDescription></DialogHeader>
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
        {row.swaps.length > 0 && <p className="text-muted-foreground text-xs">Swapped: {row.swaps.join(", ")}</p>}
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
function MoveBadge({ fact }: { fact: MoveFact }) {
  const Icon = fact.kind === "in" ? ArrowDownLeft : ArrowUpRight;
  return (
    <Badge className={cn(PILL[fact.kind], "h-auto whitespace-normal text-left")}>
      <Icon aria-hidden />
      {fact.text}
    </Badge>
  );
}
