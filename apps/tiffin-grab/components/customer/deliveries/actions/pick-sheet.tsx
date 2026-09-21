"use client";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadPickGrid, type PickGrid } from "@/app/(customer)/me/deliveries/pick-grid";
import { applyMyDishToWeek, pickMyDish } from "@/app/(customer)/me/meals/actions";
import { Button, Notice, Reason, SelectableCard, Segmented, Sheet, Skeleton, panelId } from "@/components/customer/kit";
import { DishImage } from "@/components/customer/home/dish-image";
import { actionAvailability, formatCutoff, humanDate } from "@/lib/deliveries-view";
import type { GridCell } from "@/lib/menu/meals-grid";
import type { ActionSheetProps } from "./types";

const PREFIX = "pick";
const shortDay = (iso: string) => humanDate(iso).replace(",", "");
const cellKey = (c: GridCell) => `${c.dateIso}:${c.slot}:${c.personIndex}:${c.pickIndex}`;
const muted = "text-[var(--muted-foreground,#6E6558)]";

export function PickSheet({ trip, plan, open, onDone }: ActionSheetProps) {
  const [now] = useState(() => Date.now());
  const av = actionAvailability(trip, now, plan.ctx).pick;
  const closed = now >= trip.cutoffAt;
  const reason = !av.ok ? av.why : closed ? `Changes closed ${formatCutoff(trip.cutoffAt, plan.ctx.timezone)}. This trip is being prepared.` : null;
  const dates = useMemo(() => (trip.coversDates.length ? trip.coversDates : [trip.date]), [trip]);

  const [state, setState] = useState<{ grid: PickGrid | null } | { error: string } | null>(null);
  const [day, setDay] = useState(dates[0]);
  const [person, setPerson] = useState(1);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let live = true;
    loadPickGrid(plan.orderId, dates)
      .then((r) => live && setState("error" in r ? r : { grid: r.grid }))
      .catch(() => live && setState({ error: "Couldn't load the menu. Try again." }));
    return () => {
      live = false;
    };
  }, [plan.orderId, dates]);

  const grid = state && "grid" in state ? state.grid : null;
  const tabs = grid ? dates.filter((d) => grid.cells.some((c) => c.dateIso === d)) : [];
  const activeDay = tabs.includes(day) ? day : tabs[0];
  const persons = grid?.persons ?? 1;
  const who = Math.min(person, persons);
  const cells = grid?.cells.filter((c) => c.dateIso === activeDay && c.personIndex === who) ?? [];
  const lockNote = cells.find((c) => c.lockNote)?.lockNote ?? null;
  const dayLocked = closed || (cells.length > 0 && cells.every((c) => c.locked));
  const categories = [...(grid?.categories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const pick = async (cell: GridCell, dishId: string) => {
    const key = cellKey(cell);
    const prev = picked[key];
    setPicked((p) => ({ ...p, [key]: dishId }));
    setBusy(key);
    setError(null);
    setApplied(null);
    try {
      const r = await pickMyDish({
        orderId: plan.orderId, menuWeekId: grid!.weekByDate[cell.dateIso], dayOfWeek: cell.day,
        slot: cell.slot, personIndex: cell.personIndex, pickIndex: cell.pickIndex, dishId,
      });
      if ("error" in r) throw new Error(r.error);
      setTouched(true);
    } catch (e) {
      setPicked((p) => {
        const next = { ...p };
        if (prev == null) delete next[key];
        else next[key] = prev;
        return next;
      });
      setError(e instanceof Error && e.message ? e.message : "Couldn't save that pick. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const applyWeek = async (cell: GridCell, dishId: string) => {
    const key = `week:${cellKey(cell)}`;
    setBusy(key);
    setError(null);
    try {
      const r = await applyMyDishToWeek({
        orderId: plan.orderId, menuWeekId: grid!.weekByDate[cell.dateIso], slot: cell.slot,
        personIndex: cell.personIndex, pickIndex: cell.pickIndex, dishId,
      });
      if ("error" in r) setError(r.error);
      else {
        setTouched(true);
        setApplied(`Applied to the rest of the week${r.skipped.length ? `, except ${r.skipped.map(shortDay).join(", ")} (locked)` : ""}.`);
      }
    } catch {
      setError("Couldn't apply to the week. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const footer = (
    <Button variant="primary" size="lg" className="w-full" onClick={() => onDone(touched ? "Meals saved" : undefined)}>
      Done
    </Button>
  );

  return (
    <Sheet open={open} onClose={() => onDone(touched ? "Meals saved" : undefined)} title="Pick meals" footer={footer}>
      <div className="flex flex-col gap-4 pb-2">
        {reason ? <Notice>{reason}</Notice> : <Reason>Closes {formatCutoff(trip.cutoffAt, plan.ctx.timezone)}. Anything you skip uses the default pick.</Reason>}
        {state === null && (
          <div className="grid gap-3" aria-busy="true" aria-label="Loading menu">
            <Skeleton className="h-11 w-full rounded-full" />
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[72px] w-full rounded-[20px]" />)}
          </div>
        )}
        {state && "error" in state && <Notice tone="error">{state.error}</Notice>}
        {state && "grid" in state && !grid && <Notice>The menu for {dates.length > 1 ? "these days" : humanDate(dates[0])} isn&apos;t out yet. We&apos;ll use the default menu.</Notice>}
        {grid && (
          <>
            {tabs.length > 1 && (
              <Segmented label="Eating day" idPrefix={PREFIX} value={activeDay} onChange={setDay} items={tabs.map((d) => ({ id: d, label: shortDay(d) }))} />
            )}
            {persons > 1 && (
              <Segmented label="Person" idPrefix="pick-person" value={String(who)} onChange={(v) => setPerson(Number(v))} items={Array.from({ length: persons }, (_, i) => ({ id: String(i + 1), label: `Person ${i + 1}` }))} />
            )}
            <div role="tabpanel" id={panelId(PREFIX, activeDay)} className="flex flex-col gap-5">
              <div>
                <h3 className="text-[17px] font-semibold">{humanDate(activeDay)}</h3>
                {lockNote && <p className={`text-[13px] ${muted}`}>{lockNote}</p>}
                {dayLocked && <p className={`text-[13px] ${muted}`}>Locked. Your picks for this day are final.</p>}
              </div>
              {categories.map((cat) => {
                const mine = cells.filter((c) => c.slot === cat.key);
                if (!mine.length) return null;
                return mine.map((cell) => {
                  const key = cellKey(cell);
                  const label = cell.selectable && mine.length > 1 ? `${cat.label} ${cell.pickIndex} of ${mine.length}` : cat.label;
                  const locked = dayLocked || cell.locked;
                  const chosen = picked[key] ?? cell.selectedDishId;
                  if (!cell.selectable) {
                    const dish = cell.dishes[0];
                    return dish ? (
                      <section key={key} aria-label={label} className="grid gap-1">
                        <h4 className={`text-[13px] font-semibold uppercase tracking-wide ${muted}`}>{label}{cell.quantity > 1 ? ` x${cell.quantity}` : ""}</h4>
                        <p className="text-[15px]">{dish.name} <span className={muted}>Included</span></p>
                      </section>
                    ) : null;
                  }
                  return (
                    <section key={key} aria-label={label} className="grid gap-2">
                      <h4 className={`text-[13px] font-semibold uppercase tracking-wide ${muted}`}>{label}</h4>
                      <div className="grid gap-2">
                        {cell.dishes.map((d) => {
                          const on = d.id === chosen;
                          return (
                            <SelectableCard
                              key={d.id}
                              selected={on}
                              disabled={locked}
                              onClick={() => !on && void pick(cell, d.id)}
                              title={d.name}
                              description={on && cell.isDefaulted && picked[key] == null ? "Default pick" : undefined}
                              className="min-h-[72px] p-3 [&_.c-h2]:text-base"
                              trailing={
                                <span className="relative size-14 shrink-0 overflow-hidden rounded-xl">
                                  <DishImage image={d.image} name={d.name} category={cell.slot} sizes="56px" />
                                  {on && (
                                    <span className="absolute inset-0 grid place-items-center bg-[color-mix(in_oklch,var(--primary)_55%,transparent)] text-[var(--primary-foreground,#fff)]">
                                      <Check aria-hidden className="size-6" />
                                    </span>
                                  )}
                                </span>
                              }
                            />
                          );
                        })}
                      </div>
                      {!locked && chosen && (
                        <Button variant="quiet" className="w-full" pending={busy === `week:${key}`} onClick={() => void applyWeek(cell, chosen)}>
                          Apply to the whole week
                        </Button>
                      )}
                    </section>
                  );
                });
              })}
            </div>
            {applied && <Notice>{applied}</Notice>}
            {error && <Notice tone="error">{error}</Notice>}
          </>
        )}
      </div>
    </Sheet>
  );
}
