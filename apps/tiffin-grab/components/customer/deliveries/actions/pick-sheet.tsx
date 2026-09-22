"use client";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadPickGrid, type PickGrid } from "@/app/(customer)/me/deliveries/pick-grid";
import { applyMyDishToWeek, pickMyDish } from "@/app/(customer)/me/meals/actions";
import { Button, Notice, Reason, SelectableCard, Segmented, Sheet, Skeleton, panelId } from "@/components/customer/kit";
import { DishImage } from "@/components/customer/home/dish-image";
import { actionAvailability, formatCutoff, humanDate } from "@/lib/deliveries-view";
import type { GridCell } from "@/lib/menu/meals-grid";
import {
  buildMealSummary,
  cellKey,
  effectiveDishId,
  groupPickCells,
  portionHeaderHint,
  resolveDishTap,
  selectedProgress,
  type PickCategoryGroup,
} from "@/lib/menu/pick-groups";
import type { ActionSheetProps } from "./types";

const PREFIX = "pick";
const shortDay = (iso: string) => humanDate(iso).replace(",", "");
const muted = "text-[var(--muted-foreground,#6E6558)]";

/** Map server skip reasons to short customer labels — never invent category-specific copy. */
export function skipDayHint(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("lock") || r.includes("cutoff") || r.includes("closed") || r.includes("prepared")) return "locked";
  if (r.includes("menu") || r.includes("not available") || r.includes("no dish")) return "not on menu";
  if (r.includes("invalid pick") || r.includes("swap")) return "after swaps";
  if (r.includes("exclusive") || r.includes("at most") || r.includes("meal rule")) return "meal rules";
  return "unavailable";
}

function formatApplyWeekSkips(skipped: { dateIso: string; reason: string }[]): string {
  const unique = new Map<string, string>();
  for (const s of skipped) {
    const day = shortDay(s.dateIso);
    if (!unique.has(day)) unique.set(day, skipDayHint(s.reason));
  }
  return [...unique.entries()].map(([day, hint]) => `${day} (${hint})`).join(", ");
}

export function PickSheet({ trip, plan, open, day: startDay, onDone }: ActionSheetProps) {
  const [now] = useState(() => Date.now());
  const av = actionAvailability(trip, now, plan.ctx).pick;
  const closed = now >= trip.cutoffAt;
  const reason = !av.ok ? av.why : closed ? `Changes closed ${formatCutoff(trip.cutoffAt, plan.ctx.timezone)}. This trip is being prepared.` : null;
  const dates = useMemo(() => (trip.coversDates.length ? trip.coversDates : [trip.date]), [trip]);

  const [state, setState] = useState<{ grid: PickGrid | null } | { error: string } | null>(null);
  const [day, setDay] = useState(startDay && dates.includes(startDay) ? startDay : dates[0]);
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

  const refreshGrid = async () => {
    try {
      const r = await loadPickGrid(plan.orderId, dates);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setState({ grid: r.grid });
      setPicked({});
    } catch {
      setError("Couldn't refresh the menu. Try again.");
    }
  };

  const grid = state && "grid" in state ? state.grid : null;
  const tabs = grid ? dates.filter((d) => grid.cells.some((c) => c.dateIso === d)) : [];
  const activeDay = tabs.includes(day) ? day : tabs[0];
  const persons = grid?.persons ?? 1;
  const who = Math.min(person, persons);
  const cells = grid?.cells.filter((c) => c.dateIso === activeDay && c.personIndex === who) ?? [];
  const lockNote = cells.find((c) => c.lockNote)?.lockNote ?? null;
  const dayLocked = closed || (cells.length > 0 && cells.every((c) => c.locked));

  const groups = grid
    ? groupPickCells(cells, grid.categories, grid.portionsByDate[activeDay!] ?? grid.portionsBySlot)
    : [];
  const summary = buildMealSummary(groups, picked);

  const persist = async (cell: GridCell, dishId: string) => {
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

  const onDishTap = (group: PickCategoryGroup, dishId: string) => {
    if (dayLocked) return;
    const resolved = resolveDishTap(group, dishId, picked);
    if (!resolved) return;
    void persist(resolved.cell, resolved.dishId);
  };

  const applyWeekGroup = async (group: PickCategoryGroup) => {
    if (dayLocked || !group.selectable || busy != null) return;
    setBusy(`week:${group.key}`);
    setError(null);
    try {
      const notes: { dateIso: string; reason: string }[] = [];
      for (const cell of group.cells) {
        const dishId = effectiveDishId(cell, picked);
        if (!dishId) continue;
        const r = await applyMyDishToWeek({
          orderId: plan.orderId, menuWeekId: grid!.weekByDate[cell.dateIso], slot: cell.slot,
          personIndex: cell.personIndex, pickIndex: cell.pickIndex, dishId,
        });
        if ("error" in r) {
          setError(r.error);
          await refreshGrid();
          return;
        }
        if (r.skipped.length) notes.push(...r.skipped);
      }
      setTouched(true);
      setApplied(
        `Applied to the rest of the week${notes.length ? `, except ${formatApplyWeekSkips(notes)}` : ""}.`,
      );
      await refreshGrid();
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

              {groups.map((group) => {
                const locked = dayLocked || group.cells.every((c) => c.locked);
                const progress = selectedProgress(group, picked);
                const hint = portionHeaderHint(group.portions);
                const selectedIds = new Set(group.cells.map((c) => effectiveDishId(c, picked)).filter(Boolean) as string[]);

                if (!group.selectable) {
                  const dish = group.dishes[0];
                  return dish ? (
                    <section key={group.key} aria-label={group.label} className="grid gap-1">
                      <h4 className={`text-[13px] font-semibold uppercase tracking-wide ${muted}`}>{group.label}</h4>
                      {hint && <p className={`text-[13px] ${muted}`}>{hint}</p>}
                      <p className="text-[15px]">{dish.name} <span className={muted}>Included</span></p>
                    </section>
                  ) : null;
                }

                return (
                  <section key={group.key} aria-label={`${group.label}, choose ${group.chooseCount}`} className="grid gap-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <h4 className={`text-[13px] font-semibold uppercase tracking-wide ${muted}`}>{group.label}</h4>
                        <p className="text-[15px] font-medium">Choose {group.chooseCount}</p>
                        {hint ? <p className={`text-[13px] ${muted}`}>{hint}</p> : null}
                      </div>
                      <p className={`text-[13px] tabular-nums ${muted}`} aria-live="polite">
                        Selected: {progress} of {group.chooseCount}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {group.dishes.map((d) => {
                        const on = selectedIds.has(d.id);
                        const countOn = group.cells.filter((c) => effectiveDishId(c, picked) === d.id).length;
                        return (
                          <SelectableCard
                            key={d.id}
                            selected={on}
                            disabled={locked || busy != null}
                            onClick={() => !locked && void onDishTap(group, d.id)}
                            title={d.name}
                            description={
                              on && countOn > 1
                                ? `${countOn} selected`
                                : on && group.cells.some((c) => effectiveDishId(c, picked) === d.id && c.isDefaulted && picked[cellKey(c)] == null)
                                  ? "Default pick"
                                  : undefined
                            }
                            className="min-h-[72px] p-3 [&_.c-h2]:text-base"
                            trailing={
                              <span className="relative size-14 shrink-0 overflow-hidden rounded-xl">
                                <DishImage image={d.image} name={d.name} category={group.key} sizes="56px" />
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
                    {!locked && (
                      <Button
                        variant="quiet"
                        className="w-full"
                        pending={busy === `week:${group.key}`}
                        disabled={busy != null}
                        onClick={() => void applyWeekGroup(group)}
                      >
                        Apply to the whole week
                      </Button>
                    )}
                  </section>
                );
              })}

              {summary.length > 0 && (
                <section aria-label="Your meal" className="border-t border-[var(--border,#E8E0D5)] pt-4">
                  <h3 className="text-[17px] font-semibold">Your meal</h3>
                  <div className="mt-3 grid gap-3">
                    {summary.map((block) => (
                      <div key={block.categoryLabel}>
                        <h4 className={`text-[13px] font-semibold uppercase tracking-wide ${muted}`}>{block.categoryLabel}</h4>
                        <ul className="mt-1 grid gap-0.5">
                          {block.lines.map((line) => (
                            <li key={`${block.categoryLabel}:${line}`} className="text-[15px]">{line}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
            {applied && <Notice>{applied}</Notice>}
            {error && <Notice tone="error">{error}</Notice>}
          </>
        )}
      </div>
    </Sheet>
  );
}
