"use client";

import { ChevronLeft, ChevronRight, Info, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { cn } from "@foundry/ui/cn";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import {
  applyMyDeliverySwap,
  pauseMySubscription,
  removeMyDeliverySwap,
  rescheduleMyDelivery,
  resumeMySubscription,
  scheduleMyPooledTiffin,
  unskipMyDelivery,
} from "@/app/(customer)/me/deliveries/actions";
import { buildVacationPauseRequest } from "@/app/(customer)/me/deliveries/vacation-pause";
import { actionAvailability, formatCutoff, humanDate, type Trip, type TripAction } from "@/lib/deliveries-view";
import { buildEatingDays, deliveryLine, weekdayShort, type EatingRow } from "@/lib/deliveries-view/eating";
import { moveOptions } from "@/lib/deliveries-view/move";
import { addDays, dotStatus, mondayOf, weekDays } from "@/lib/deliveries-view/week";
import { applySwapsToCounts, swapAmounts, swapLabel, swapQuantities } from "@/lib/menu/swap-rules";
import type { OrderWeek } from "@/lib/services/order-week.service";
import { EXPLAIN, statusMeta, tiffins } from "@/components/customer/deliveries/trip-parts";

type Dlg = "reschedule" | "swap" | "vacation" | "makeup" | "info" | null;
const STATUS_TONE: Record<string, string> = {
  delivered: "bg-emerald-500", upcoming: "bg-sky-500", vacation: "bg-amber-500", hold: "bg-rose-500", combined: "bg-muted-foreground",
};
const MON = new Intl.DateTimeFormat("en-CA", { month: "short", timeZone: "UTC" });
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const rank = (t: Trip) => (t.status === "upcoming" ? 0 : t.status === "hold" ? 1 : 2);

export function OrderWeekHub({ data }: { data: OrderWeek }) {
  const { plan, trips, agenda, weekStart, firstWeek, lastWeek, now } = data;
  const router = useRouter();
  const [nav, startNav] = useTransition();
  const [sel, setSel] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [wk, setWk] = useState(weekStart);
  if (wk !== weekStart) (setWk(weekStart), setSel(null));

  const weekEnd = addDays(weekStart, 6);
  const rows = useMemo(() => buildEatingDays(trips).filter((r) => r.date >= weekStart && r.date <= weekEnd), [trips, weekStart, weekEnd]);
  const row: EatingRow | null = (sel ? rows.find((r) => r.date === sel) : null) ?? (sel ? null : [...rows].sort((a, b) => rank(a.trip) - rank(b.trip) || a.date.localeCompare(b.date))[0] ?? null);
  const trip = row?.trip ?? null;
  const av = trip ? actionAvailability(trip, now, plan.ctx) : null;
  const tz = plan.ctx.timezone;
  const eatingSwaps = row ? plan.days.find((x) => x.date === row.trip.date)?.eatingDays?.find((e) => e.date === row.date) : undefined;
  const leftCounts = plan.sub.categoryCounts ? applySwapsToCounts(plan.sub.categoryCounts, eatingSwaps?.appliedSwaps ?? []) : null;
  const canSwap = (eatingSwaps?.swapPairs ?? []).some((q) => !leftCounts || (leftCounts[q.fromCategory] ?? 0) >= 1);

  const goWeek = (m: string, tripDate?: string) =>
    startNav(() => router.replace(`?week=${m}${tripDate ? `&trip=${tripDate}` : ""}`, { scroll: false }));
  const refresh = (msg: string) => (toast.success(msg), setDlg(null), router.refresh());
  const weeks: string[] = [];
  for (let w = firstWeek; w <= lastWeek; w = addDays(w, 7)) weeks.push(w);
  const nextTruck = Object.values(agenda).flat().filter((x) => x.truck && x.status === "scheduled" && x.deliveryDate >= plan.today).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))[0];

  return (
    <div className={cn("space-y-4", nav && "opacity-60 transition-opacity")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">{plan.sub.status}</Badge>
        <span className="font-medium">{plan.sub.mealSizeName}</span>
        <span className="text-muted-foreground tabular-nums">
          {plan.counts.remaining} of {plan.counts.total} tiffins left
          {plan.counts.holdDays > 0 && ` · ${plan.counts.holdDays} hold ${plan.counts.holdDays === 1 ? "day" : "days"}`}
          {plan.counts.pooled > 0 && ` · ${plan.counts.pooled} in pool`}
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDlg("vacation")}>{plan.ctx.onVacation ? "Resume from vacation" : "Vacation"}</Button>
          {plan.counts.pooled > 0 && <Button size="sm" variant="outline" onClick={() => setDlg("makeup")}>Make-up ({plan.counts.pooled})</Button>}
        </div>
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
                      className={cn("relative flex h-16 flex-col items-center justify-center gap-1 rounded-md border text-xs", picked ? "border-primary bg-primary/10 font-semibold" : "border-transparent hover:bg-muted", iso === plan.today && "ring-1 ring-primary")}
                    >
                      <span className="text-muted-foreground">{weekdayShort(iso)[0]}</span>
                      {ds.some((x) => x.truck) && <Truck aria-hidden className="text-muted-foreground absolute right-1 top-1 size-3" />}
                      <b className="text-sm tabular-nums">{d(iso).getUTCDate()}</b>
                      <span className="flex h-2 gap-0.5">
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

      {rows.length === 0 ? (
        <Card><CardContent className="text-muted-foreground py-6 text-sm">No eating days this week.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <div className="space-y-1" role="list" aria-label="Eating days">
            {rows.map((r) => {
              const m = statusMeta(r.trip);
              const on = row?.date === r.date;
              return (
                <div key={r.date} role="listitem" className="flex items-center">
                  <button type="button" data-testid="trip-row" aria-pressed={on} onClick={() => setSel(r.date)} className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-left", on ? "bg-muted" : "hover:bg-muted/60")}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{humanDate(r.date)}</span>
                      <span className="text-muted-foreground block truncate text-xs">{r.dish ?? "Default menu"}</span>
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
                <CardTitle className="flex flex-wrap items-baseline gap-2">
                  {humanDate(row.date)} <span className="text-muted-foreground text-sm font-normal">(eating)</span>
                  <Badge variant="outline">{statusMeta(trip).label}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">{row.dish ?? <span className="text-muted-foreground">Default menu</span>}</p>
                {row.swaps.length > 0 && <p className="text-muted-foreground text-xs">Swapped: {row.swaps.join(", ")}</p>}
                <div className="bg-muted/50 rounded-md p-3 text-sm" data-testid="delivery-block">
                  <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Delivery</p>
                  <p className="font-medium">{deliveryLine(row)}</p>
                  <p className="text-muted-foreground text-xs">
                    {tiffins(trip.units)} covering {trip.coversDates.map(weekdayShort).join(", ")}
                    {trip.status === "upcoming" && ` · changes close ${formatCutoff(trip.cutoffAt, tz)}`}
                    {!row.own && trip.status === "upcoming" && ` · locks with ${weekdayShort(trip.date)}'s delivery`}
                  </p>
                </div>
                <Actions trip={trip} av={av} canSwap={canSwap} onOpen={setDlg} onResume={async () => {
                  const r = await unskipMyDelivery(trip.deliveryId!);
                  "error" in r ? toast.error(r.error) : refresh(`Resumed ${humanDate(trip.date)}.`);
                }} />
                <p className="text-muted-foreground text-xs">Meal picks for the week are in &quot;This week&apos;s meals&quot; below.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {dlg === "info" && row && <InfoDialog row={row} tz={tz} onClose={() => setDlg(null)} />}
      {dlg === "reschedule" && trip && <RescheduleDialog trip={trip} data={data} onClose={() => setDlg(null)} onDone={refresh} />}
      {dlg === "swap" && row && <SwapDialog row={row} data={data} onClose={() => setDlg(null)} onDone={refresh} />}
      {dlg === "vacation" && <VacationDialog data={data} onClose={() => setDlg(null)} onDone={refresh} />}
      {dlg === "makeup" && <MakeupDialog data={data} onClose={() => setDlg(null)} onDone={refresh} />}
    </div>
  );
}

function Actions({ trip, av, canSwap, onOpen, onResume }: { trip: Trip; av: ReturnType<typeof actionAvailability>; canSwap: boolean; onOpen: (d: Dlg) => void; onResume: () => void }) {
  const held = trip.status === "hold" || trip.status === "rescheduled";
  const items: { key: TripAction; label: string; run: () => void }[] = [
    ...(canSwap ? [{ key: "swap" as const, label: "Swap items", run: () => onOpen("swap") }] : []),
    { key: "move", label: "Reschedule this day", run: () => onOpen("reschedule") },
    ...(held ? [{ key: "resume" as const, label: "Resume this trip", run: onResume }] : []),
  ];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {items.map((i) => <Button key={i.key} variant={i.key === "resume" ? "default" : "outline"} size="sm" disabled={!av[i.key].ok} onClick={i.run}>{i.label}</Button>)}
      </div>
      {items.filter((i) => !av[i.key].ok).map((i) => <p key={i.key} className="text-muted-foreground text-xs">{i.label}: {av[i.key].why}</p>)}
    </div>
  );
}

function InfoDialog({ row, tz, onClose }: { row: EatingRow; tz: string; onClose: () => void }) {
  const t = row.trip;
  const facts: [string, string][] = [
    ["Status", statusMeta(t).label],
    ["Delivery day", humanDate(t.date)],
    ["Feeds", `${t.coversDates.map(humanDate).join(", ")} (${tiffins(t.units)})`],
    ["Changes close", `${t.status === "upcoming" ? "" : "Closed "}${formatCutoff(t.cutoffAt, tz)}`],
    ...(t.isMakeup ? [["Type", "Make-up delivery"] as [string, string]] : []),
    ...(t.pooled ? [["Pool", "Tiffin is in the pool"] as [string, string]] : []),
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{humanDate(row.date)} · trip details</DialogTitle><DialogDescription>{EXPLAIN[t.status]}</DialogDescription></DialogHeader>
        <dl className="divide-y rounded-md border text-sm">
          {facts.map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-3 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

type Res = { ok: true; message?: string } | { error: string };
function useRun(onDone: (m: string) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<Res>, ok: string) => {
    setPending(true); setError(null);
    try { const r = await fn(); "error" in r ? setError(r.error) : onDone(ok); } catch { setError("Couldn't reach the server."); } finally { setPending(false); }
  };
  return { pending, error, run };
}
const Err = ({ e }: { e: string | null }) => (e ? <p role="alert" className="text-destructive text-sm">{e}</p> : null);

function RescheduleDialog({ trip, data, onClose, onDone }: { trip: Trip; data: OrderWeek; onClose: () => void; onDone: (m: string) => void }) {
  const { plan, now } = data;
  const options = useMemo(() => moveOptions(trip, plan.days, now, plan.ctx, plan.today).filter((o) => !o.disabledReason), [trip, plan, now]);
  const [date, setDate] = useState<string>("");
  const { pending, error, run } = useRun(onDone);
  const o = options.find((x) => x.date === date);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reschedule {humanDate(trip.date)}</DialogTitle><DialogDescription>Pick the day the customer wants to eat. The delivery day is chosen automatically.</DialogDescription></DialogHeader>
        <Select value={date} onValueChange={setDate}>
          <SelectTrigger aria-label="New day to eat"><SelectValue placeholder="Choose a day" /></SelectTrigger>
          <SelectContent>{options.map((x) => <SelectItem key={x.date} value={x.date}>{humanDate(x.date)}</SelectItem>)}</SelectContent>
        </Select>
        {o && (
          <p className="text-muted-foreground text-sm">
            {o.merge ? `${humanDate(o.date)} already has a delivery: both trips combine into ${tiffins(o.merge.units)}.` : o.carriedOn !== o.date ? `${humanDate(o.date)} will arrive ${humanDate(o.carriedOn)} with ${weekdayShort(o.carriedOn)}.` : `Arrives ${humanDate(o.date)}.`}
          </p>
        )}
        <Err e={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!o || pending} onClick={() => run(() => rescheduleMyDelivery(trip.deliveryId!, date), `Moved ${humanDate(trip.date)} to ${humanDate(date)}.`)}>{pending ? "Saving…" : "Confirm"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SwapDialog({ row, data, onClose, onDone }: { row: EatingRow; data: OrderWeek; onClose: () => void; onDone: (m: string) => void }) {
  const { plan } = data;
  const trip = row.trip;
  const label = (k: string) => plan.categoryLabels[k] ?? k;
  const eating = plan.days.find((x) => x.date === trip.date)?.eatingDays?.find((e) => e.date === row.date);
  const applied = eating?.appliedSwaps ?? [];
  const left = plan.sub.categoryCounts ? applySwapsToCounts(plan.sub.categoryCounts, applied) : null;
  const pairs = [...new Map((eating?.swapPairs ?? []).map((p) => [`${p.fromCategory}>${p.toCategory}`, p])).values()].filter((p) => !left || (left[p.fromCategory] ?? 0) >= 1);
  const [pair, setPair] = useState("");
  const [qty, setQty] = useState(1);
  const chosen = pairs.find((p) => `${p.fromCategory}>${p.toCategory}` === pair);
  const from = chosen ? plan.swapCategories[chosen.fromCategory] : undefined;
  const to = chosen ? plan.swapCategories[chosen.toCategory] : undefined;
  const r = from && to ? swapQuantities(from, to, qty) : null;
  const amounts = chosen && r?.ok ? swapAmounts(from, to, qty, r.qtyTo) : null;
  const { pending, error, run } = useRun(onDone);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Swap items · {humanDate(row.date)}</DialogTitle><DialogDescription>Swaps apply to this eating day only.</DialogDescription></DialogHeader>
        {applied.length > 0 && (
          <ul className="space-y-1 text-sm">
            {applied.map((s) => (
              <li key={s.publicId} className="flex items-center justify-between gap-2">
                <Badge variant="secondary">{swapLabel(s, label, plan.swapCategories)}</Badge>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeMyDeliverySwap(trip.deliveryId!, s.publicId, row.date), "Swap removed.")}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
        {pairs.length === 0 ? <p className="text-muted-foreground text-sm">No swaps are available for this meal size.</p> : (
          <div className="space-y-3">
            <Select value={pair} onValueChange={(v) => (setPair(v), setQty(1))}>
              <SelectTrigger aria-label="Swap"><SelectValue placeholder="Choose a swap" /></SelectTrigger>
              <SelectContent>{pairs.map((p) => <SelectItem key={`${p.fromCategory}>${p.toCategory}`} value={`${p.fromCategory}>${p.toCategory}`}>{label(p.fromCategory)} → {label(p.toCategory)}</SelectItem>)}</SelectContent>
            </Select>
            {chosen && (
              <div className="space-y-1">
                <Label htmlFor="swap-picks">{label(chosen.fromCategory)} picks to give up</Label>
                <Input id="swap-picks" type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
                <p className="text-muted-foreground text-sm">
                  {r && !r.ok ? r.reason : amounts ? <>Give up <b>{label(chosen.fromCategory)} · {amounts.give}</b>, get <b>{label(chosen.toCategory)} · {amounts.get}</b>.</> : r?.ok ? `Give up ${qty} ${label(chosen.fromCategory)}, get ${r.qtyTo} ${label(chosen.toCategory)}.` : ""}
                </p>
              </div>
            )}
          </div>
        )}
        <Err e={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={!chosen || !r?.ok || pending} onClick={() => run(() => applyMyDeliverySwap(trip.deliveryId!, chosen!.fromCategory, chosen!.toCategory, qty, row.date), `Swap applied to ${humanDate(row.date)}.`)}>Apply swap</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VacationDialog({ data, onClose, onDone }: { data: OrderWeek; onClose: () => void; onDone: (m: string) => void }) {
  const { plan } = data;
  const on = plan.sub.status === "paused" || !!plan.ctx.onVacation;
  const [start, setStart] = useState(plan.today);
  const [end, setEnd] = useState("");
  const { pending, error, run } = useRun(onDone);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{on ? "Resume deliveries" : "Vacation"}</DialogTitle><DialogDescription>{on ? "Deliveries are paused for this plan." : "Pause deliveries from a start day; leave the end empty to pause until resumed."}</DialogDescription></DialogHeader>
        {!on && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="v-start">Start</Label><Input id="v-start" type="date" min={plan.today} value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="v-end">End (optional)</Label><Input id="v-end" type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
        )}
        <Err e={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || (!on && !start)} onClick={() => run(() => (on ? resumeMySubscription(plan.orderId) : pauseMySubscription(plan.orderId, buildVacationPauseRequest(start, end))), on ? "Deliveries resumed." : "Vacation started.")}>{on ? "Resume" : "Start vacation"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MakeupDialog({ data, onClose, onDone }: { data: OrderWeek; onClose: () => void; onDone: (m: string) => void }) {
  const { plan } = data;
  const after = plan.ctx.lastDeliveryDate ? addDays(plan.ctx.lastDeliveryDate, 1) : plan.today;
  const [date, setDate] = useState(after);
  const { pending, error, run } = useRun(onDone);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Schedule a make-up</DialogTitle><DialogDescription>{plan.counts.pooled} {plan.counts.pooled === 1 ? "tiffin is" : "tiffins are"} waiting. Pick a day after {plan.ctx.lastDeliveryDate ? humanDate(plan.ctx.lastDeliveryDate) : "the last delivery"} on a plan weekday.</DialogDescription></DialogHeader>
        <div className="space-y-1"><Label htmlFor="mk-date">Day to eat</Label><Input id="mk-date" type="date" min={after} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <Err e={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!date || pending} onClick={() => run(() => scheduleMyPooledTiffin(plan.orderId, date), `Make-up scheduled for ${humanDate(date)}.`)}>Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
