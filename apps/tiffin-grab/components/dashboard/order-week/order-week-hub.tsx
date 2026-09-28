/* eslint-disable */
"use client";

import { dropOffSummary } from "@/lib/catalog/drop-off";
import { ChevronLeft, ChevronRight, Info, Truck, Utensils } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { cn } from "@foundry/ui/cn";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { actionAvailability, formatCutoff, humanDate, type Trip, type TripAction } from "@/lib/deliveries-view";
import { deliveryLine, eatingRowsInWeek, isAddressRow, movedInNote, weekdayShort, type EatingRow } from "@/lib/deliveries-view/eating";
import { addDays, dotStatus, mondayOf, weekDays } from "@/lib/deliveries-view/week";
import type { OrderWeek } from "@/lib/services/order-week.service";
import { movedFact, rowMeta, tiffins } from "@/components/customer/deliveries/trip-parts";
import { OrderStatusBadge } from "@/components/ds";
import { TableCell } from "@foundry/ui/table";
import { PagedTable } from "./paged-table";
import { AddressSheet } from "@/components/customer/deliveries/actions/address-sheet";
import { MoveSheet } from "@/components/customer/deliveries/actions/move-sheet";
import { actionModel } from "@/components/customer/deliveries/action-model";
import { PickSheet } from "@/components/customer/deliveries/actions/pick-sheet";
import { ADMIN_SHEET_UI } from "./admin-sheet-ui";

type Dlg = "reschedule" | "info" | "address" | "pick" | null;
const STATUS_TONE: Record<string, string> = {
  delivered: "bg-emerald-500", upcoming: "bg-sky-500", vacation: "bg-amber-500", hold: "bg-rose-500", combined: "bg-muted-foreground",
};
const MON = new Intl.DateTimeFormat("en-CA", { month: "short", timeZone: "UTC" });
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const rank = (t: Trip) => (t.status === "upcoming" ? 0 : t.status === "failed" ? 1 : 2);

export function OrderWeekHub({ data }: { data: OrderWeek }) {
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
  const av = trip ? actionAvailability(trip, now, plan.ctx) : null;
  const tz = plan.ctx.timezone;

  const weekDaysOfPlan = plan.days.filter((x) => x.date >= weekStart && x.date <= weekEnd);
  const menuOut = weekDaysOfPlan.length > 0 && weekDaysOfPlan.every((x) => x.menuWeekId == null);
  const scheduleRows = Object.entries(agenda).sort(([a], [b]) => a.localeCompare(b)).flatMap(([date, ds]) => ds.map((x) => ({ date, ...x })));
  // Keep ?tab (and anything else) so a week change never drops the admin back on Overview.
  const goWeek = (m: string, tripDate?: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("week", m);
    if (tripDate) sp.set("trip", tripDate);
    else sp.delete("trip");
    startNav(() => router.replace(`?${sp.toString()}`, { scroll: false }));
  };
  const done = (msg?: string) => (msg ? (toast.success(msg), setDlg(null), router.refresh()) : setDlg(null));
  const weeks: string[] = [];
  for (let w = firstWeek; w <= lastWeek; w = addDays(w, 7)) weeks.push(w);
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
              Next delivery: <b>{humanDate(nextTruck.deliveryDate)}</b>, {tiffins(nextTruck.units)} ({nextTruck.covers.map(weekdayShort).join(" + ")}) · changes close {formatCutoff(nextTruck.cutoffAt, tz)}
            </span>
          </CardContent>
        </Card>
      )}

      <div className="flex items-stretch gap-1" data-testid="week-strip">
        <Button variant="ghost" size="icon" aria-label="Previous week" disabled={weekStart <= firstWeek} onClick={() => goWeek(addDays(weekStart, -7))}><ChevronLeft /></Button>
        <div className="flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto pb-1">
          {weeks.map((w) => (
            <div key={w} className={cn("w-full shrink-0 snap-start rounded-lg border p-2 lg:w-[calc(50%-4px)]", w === weekStart ? "border-primary bg-muted/50" : "border-border")}>
              <button type="button" className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wider" onClick={() => goWeek(w)}>
                {MON.format(d(w))} {d(w).getUTCDate()} – {MON.format(d(addDays(w, 6)))} {d(addDays(w, 6)).getUTCDate()}
              </button>
              <div className="grid grid-cols-7 gap-1">
                {weekDays(w).map((iso) => {
                  const ds = agenda[iso] ?? [];
                  const picked = iso === (row?.date ?? sel);
                  return (
                    <button
                      key={iso}
                      type="button"
                      aria-pressed={picked}
                      aria-label={`${humanDate(iso)}${ds.length ? `, eating${ds.some((x) => x.truck) ? ", delivery arrives" : ""}` : ", nothing planned"}`}
                      onClick={() => (w === weekStart ? setSel(iso) : goWeek(w, iso))}
                      className={cn("relative flex h-[72px] flex-col items-center justify-center gap-1 rounded-md border text-xs", picked ? "border-primary bg-primary/10 font-semibold" : "border-transparent hover:bg-muted", iso === plan.today && "ring-1 ring-primary")}
                    >
                      <span aria-hidden className="text-muted-foreground grid w-full grid-cols-[1fr_auto_1fr] items-center px-1">
                        <span className="flex justify-end">{ds.length > 0 && <Utensils className="size-2.5" />}</span>
                        <span className="px-1">{weekdayShort(iso)[0]}</span>
                        <span className="flex justify-start">{ds.some((x) => x.truck) && <Truck className="size-2.5" />}</span>
                      </span>
                      <b className="text-sm tabular-nums">{d(iso).getUTCDate()}</b>
                      <span className="flex h-3 items-center gap-0.5">
                        {ds.map((x, i) => <span key={i} aria-hidden className={cn("size-2 rounded-full", STATUS_TONE[dotStatus(x, now)])} />)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="icon" aria-label="Next week" disabled={weekStart >= lastWeek} onClick={() => goWeek(addDays(weekStart, 7))}><ChevronRight /></Button>
      </div>

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
                  <button type="button" data-testid="trip-row" aria-pressed={on} onClick={() => setSel(r.date)} className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-left", on ? "bg-muted" : "hover:bg-muted/60")}>
                    <Utensils aria-hidden className="text-muted-foreground size-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{humanDate(r.date)}</span>
                      <span className="text-muted-foreground block truncate text-xs">{r.movedTo ? `Moved to ${humanDate(r.movedTo)}` : menuOut ? "Menu not released yet" : r.dish ?? "Default menu"}</span>
                    </span>
                    <Badge variant="outline">{m.label}</Badge>
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
                  <Badge variant="outline">{rowMeta(row).label}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {row.movedTo ? <p className="text-muted-foreground text-sm">{movedFact(row)}</p> : (
                <p className="text-muted-foreground text-sm">
                  {tiffins(trip.units)} covering {trip.coversDates.map(weekdayShort).join(" + ")}
                  {movedInNote(row) && ` · ${movedInNote(row)}`}
                  {trip.status === "upcoming" && ` · changes close ${formatCutoff(trip.cutoffAt, tz)}`}
                  {!row.own && trip.status === "upcoming" && ` · ${humanDate(row.date)} locks with ${weekdayShort(trip.date)}'s delivery`}
                </p>
                )}
                {/* The customer's own action model, so staff get exactly what the customer gets for this day. */}
                <Actions model={actionModel(trip, now, plan.ctx, { menuOut: menuOut && trip.date >= weekStart && trip.date <= weekEnd, isDeliveryDay: isAddressRow(rows, row), movedTo: row.movedTo })} onOpen={setDlg} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">All eating days</CardTitle></CardHeader>
        <CardContent>
          <PagedTable
            columns={[{ key: "day", label: "Eating day" }, { key: "delivery", label: "Delivery" }, { key: "tiffins", label: "Tiffins", className: "text-right" }, { key: "status", label: "Status" }]}
            rows={scheduleRows}
            rowKey={(x) => x.date}
            selected={(x) => x.date === row?.date}
            onRowClick={(x) => (mondayOf(x.date) === weekStart ? setSel(x.date) : goWeek(mondayOf(x.date), x.date))}
            empty="No eating days scheduled."
            renderRow={(x) => (
              <>
                <TableCell className="font-medium">{humanDate(x.date)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {x.truck ? <span className="inline-flex items-center gap-1.5"><Truck className="size-3.5" aria-hidden />Arrives {humanDate(x.deliveryDate)}</span> : `with ${weekdayShort(x.deliveryDate)}, ${humanDate(x.deliveryDate)}`}
                </TableCell>
                <TableCell className="text-right tabular-nums">{x.truck ? x.units : ""}</TableCell>
                <TableCell><Badge variant="outline">{x.moved ? "Moved" : dotStatus(x, now) === "delivered" ? "Delivered" : dotStatus(x, now) === "hold" ? "Not delivered" : dotStatus(x, now) === "vacation" ? "Vacation" : "Upcoming"}</Badge></TableCell>
              </>
            )}
          />
        </CardContent>
      </Card>

      {dlg === "info" && row && <InfoDialog row={row} plan={plan} tz={tz} onClose={() => setDlg(null)} />}
      {/* The customer's own sheets, drawn in shadcn: one implementation of every rule. */}
      {dlg === "reschedule" && trip && <MoveSheet open trip={trip} plan={plan} day={row?.date} onDone={done} ui={ADMIN_SHEET_UI} />}
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
        <DialogHeader><DialogTitle>{humanDate(row.date)} · meal</DialogTitle><DialogDescription>{[deliveryLine(row), `${tiffins(t.units)} covering ${t.coversDates.map(weekdayShort).join(" + ")}`, movedInNote(row), t.status === "upcoming" ? `changes close ${formatCutoff(t.cutoffAt, tz)}` : null].filter(Boolean).join(" · ")}</DialogDescription></DialogHeader>
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




