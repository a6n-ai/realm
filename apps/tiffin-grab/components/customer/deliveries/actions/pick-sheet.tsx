"use client";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadPickGrid, type PickGrid } from "@/app/(customer)/me/deliveries/pick-grid";
import {
  applyMyDeliverySwap,
  loadMySwapOptions,
  removeMyDeliverySwap,
} from "@/app/(customer)/me/deliveries/actions";
import { saveMyMealSelections, type PickItem } from "@/app/(customer)/me/meals/actions";
import { Button, Chip, Choice, ChoiceGroup, Notice, Reason, Segmented, Sheet, Skeleton, panelId } from "@/components/customer/kit";
import { actionAvailability, formatCutoff, humanDate } from "@/lib/deliveries-view";
import type { GridCell } from "@/lib/menu/meals-grid";
import type { SwapOption } from "@/lib/menu/meal-validation";
import {
  buildMealSummary,
  cellKey,
  effectiveDishId,
  groupPickCells,
  type PickCategoryGroup,
} from "@/lib/menu/pick-groups";
import {
  buildSlotDropdownOptions,
  dishesAllowedByRules,
  swapOptionsAllowedByRules,
  dishOptionValue,
  hasOutgoingSwapOptions,
  parseSlotOptionValue,
} from "@/lib/menu/slot-dropdown";
import { labelAppliedSwaps } from "@/lib/menu/swap-rules";
import { sanitizeClientError } from "@/lib/format/client-error";
import type { ActionSheetProps } from "./types";

const PREFIX = "pick";
const shortDay = (iso: string) => humanDate(iso).replace(",", "");
const muted = "text-[var(--muted-foreground,#6E6558)]";

function slotLabel(group: PickCategoryGroup, index: number): string {
  const portion = group.portions[index];
  if (portion) return `${group.label} · ${portion}`;
  if (group.chooseCount > 1) return `${group.label} ${index + 1}`;
  return group.label;
}

/**
 * The meal rules for this order, in the admin's own words. Shown up front so a
 * customer knows the limits before choosing; the rule that just refused a pick
 * is called out rather than left for them to work out.
 */
function MealRuleNotes({
  rules,
  violatedRuleId,
}: {
  rules: { publicId: string; text: string }[];
  violatedRuleId: string | null;
}) {
  if (rules.length === 0) return null;
  return (
    <section className="rounded-lg border p-3">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        Good to know
      </h3>
      <ul className="mt-1.5 space-y-1">
        {rules.map((r) => {
          const hit = r.publicId === violatedRuleId;
          return (
            <li
              key={r.publicId}
              // Never renders the id — it only decides which line to emphasise.
              className={hit ? "text-destructive text-sm font-medium text-pretty" : "text-muted-foreground text-sm text-pretty"}
            >
              {r.text}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function PickSheet({ trip, plan, open, day: startDay, onDone, onChanged }: ActionSheetProps) {
  const [now] = useState(() => Date.now());
  const av = actionAvailability(trip, now, plan.ctx);
  const pickAv = av.pick;
  const closed = now >= trip.cutoffAt;
  const reason = !pickAv.ok
    ? pickAv.why
    : closed
      ? `Changes closed ${formatCutoff(trip.cutoffAt, plan.ctx.timezone)}. This trip is being prepared.`
      : null;
  const swapLocked = !av.swap.ok || closed;
  const dates = useMemo(() => (trip.coversDates.length ? trip.coversDates : [trip.date]), [trip]);

  const [state, setState] = useState<{ grid: PickGrid | null } | { error: string } | null>(null);
  const [swapOptions, setSwapOptions] = useState<SwapOption[] | null>(null);
  const [day, setDay] = useState(startDay && dates.includes(startDay) ? startDay : dates[0]);
  const [person, setPerson] = useState(1);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which rule refused the last pick, so its line stands out in the list above.
  const [violatedRuleId, setViolatedRuleId] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [swapLoadKey, setSwapLoadKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const labelOf = useCallback((k: string) => plan.categoryLabels[k] ?? k, [plan.categoryLabels]);
  const source = plan.days.find((d) => d.date === trip.date);
  const eating = source?.eatingDays?.find((e) => e.date === day);
  const appliedSwaps = eating?.appliedSwaps ?? [];

  const reloadSwapOptions = useCallback(() => setSwapLoadKey((k) => k + 1), []);

  useEffect(() => {
    let live = true;
    loadPickGrid(plan.orderId, dates)
      .then((r) => live && setState("error" in r ? r : { grid: r.grid }))
      .catch(() => live && setState({ error: "Couldn't load the menu. Try again." }));
    return () => {
      live = false;
    };
  }, [plan.orderId, dates]);

  useEffect(() => {
    if (!open || swapLocked || !trip.deliveryId) {
      setSwapOptions([]);
      return;
    }
    let live = true;
    loadMySwapOptions(trip.deliveryId, day)
      .then((r) => {
        if (!live) return;
        if ("error" in r) setSwapOptions([]);
        else setSwapOptions(r.options);
      })
      .catch(() => {
        if (live) setSwapOptions([]);
      });
    return () => {
      live = false;
    };
  }, [open, swapLocked, trip.deliveryId, day, swapLoadKey]);

  const refreshGrid = async () => {
    try {
      const r = await loadPickGrid(plan.orderId, dates);
      if ("error" in r) {
        setError(sanitizeClientError(r.error));
        return;
      }
      setState({ grid: r.grid });
      setPicked((prev) => {
        if (!r.grid) return {};
        const validKeys = new Set(r.grid.cells.map(cellKey));
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (validKeys.has(k)) next[k] = v;
        }
        return next;
      });
      reloadSwapOptions();
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
  // Every pick in this meal (fixed sides too) — what meal rules are evaluated against.
  const mealPicks = cells.flatMap((c) => {
    const id = effectiveDishId(c, picked);
    const dish = id ? c.dishes.find((d) => d.id === id) : undefined;
    return dish ? [{ key: cellKey(c), category: c.slot, pickIndex: c.pickIndex, dish }] : [];
  });
  // Hide swaps whose new slots no menu dish could fill without breaking a meal rule.
  const liveSwapOptions = swapOptionsAllowedByRules({
    rules: grid?.mealRules ?? [],
    options: swapOptions ?? [],
    mealPicks: [...mealPicks].sort((a, b) => a.pickIndex - b.pickIndex),
    menuByCategory: new Map(groups.map((g) => [g.key, g.dishes])),
  });

  const persistSwap = async (fromCategory: string, toCategory: string, fromPicks: number) => {
    if (!trip.deliveryId || swapLocked) return;
    const key = `swap:${fromCategory}>${toCategory}:${fromPicks}`;
    setBusy(key);
    setError(null);
    setApplied(null);
    try {
      const r = await applyMyDeliverySwap(trip.deliveryId, fromCategory, toCategory, fromPicks, activeDay);
      if ("error" in r) throw new Error(r.error);
      setTouched(true);
      const msg = `Swapped to ${labelOf(toCategory)}. Choose a dish if needed.`;
      setApplied(msg);
      if (onChanged) onChanged(msg);
      await refreshGrid();
    } catch (e) {
      setError(sanitizeClientError(e, "Couldn't apply that swap. Try again."));
      reloadSwapOptions();
    } finally {
      setBusy(null);
    }
  };

  const onSlotChange = (cell: GridCell, cellIndexInCategory: number, value: string) => {
    if (dayLocked || busy != null || saving) return;
    const parsed = parseSlotOptionValue(value);
    if (!parsed) return;
    if (parsed.kind === "dish") {
      // Fixed (non-selectable) categories only expose a keep-dish radio so swaps can sit beside it.
      if (!cell.selectable) return;
      if (effectiveDishId(cell, picked) === parsed.dishId) return;
      const key = cellKey(cell);
      setPicked((p) => ({ ...p, [key]: parsed.dishId }));
      setTouched(true);
      setError(null);
      setViolatedRuleId(null);
      setApplied(null);
      return;
    }
    // Swaps only from the leading row — ignore stale option values.
    if (cellIndexInCategory !== 0) return;
    void persistSwap(parsed.fromCategory, parsed.toCategory, parsed.fromPicks);
  };

  const removeSwap = async (publicId: string, text: string) => {
    if (!trip.deliveryId || busy != null) return;
    setBusy(publicId);
    setError(null);
    try {
      const r = await removeMyDeliverySwap(trip.deliveryId, publicId, activeDay);
      if ("error" in r) throw new Error(r.error);
      setTouched(true);
      const msg = `Removed ${text}`;
      if (onChanged) onChanged(msg);
      await refreshGrid();
    } catch (e) {
      setError(sanitizeClientError(e, "Couldn't remove that swap. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const handleDone = async () => {
    if (saving || busy != null) return;
    const changedPicks: PickItem[] = [];
    if (grid) {
      for (const c of grid.cells) {
        if (!c.selectable) continue;
        const key = cellKey(c);
        const chosenDishId = picked[key];
        if (chosenDishId && chosenDishId !== c.selectedDishId) {
          changedPicks.push({
            menuWeekId: grid.weekByDate[c.dateIso],
            dayOfWeek: c.day,
            slot: c.slot,
            personIndex: c.personIndex,
            pickIndex: c.pickIndex,
            dishId: chosenDishId,
          });
        }
      }
    }

    if (changedPicks.length > 0) {
      setSaving(true);
      setError(null);
      setViolatedRuleId(null);
      try {
        const r = await saveMyMealSelections({
          orderId: plan.orderId,
          picks: changedPicks,
        });
        if ("error" in r) {
          setViolatedRuleId(r.violatedRuleId ?? null);
          throw new Error(r.error);
        }
        if (onChanged) onChanged("Meals saved");
        onDone("Meals saved");
      } catch (e) {
        setError(sanitizeClientError(e, "Couldn't save that pick. Try again."));
      } finally {
        setSaving(false);
      }
    } else {
      onDone(touched ? "Meals saved" : undefined);
    }
  };

  const footer = (
    <Button
      variant="primary"
      size="lg"
      className="w-full"
      pending={saving}
      disabled={saving || busy != null}
      onClick={() => void handleDone()}
    >
      Done
    </Button>
  );

  return (
    <Sheet open={open} onClose={() => onDone()} title="Edit meal" footer={footer}>
      <div className="flex flex-col gap-4 pb-2">
        {reason ? (
          <Notice>{reason}</Notice>
        ) : (
          <Reason>
            Closes {formatCutoff(trip.cutoffAt, plan.ctx.timezone)}. Pick a dish for each item, or swap an item to another category when offered.
          </Reason>
        )}
        {state === null && (
          <div className="grid gap-3" aria-busy="true" aria-label="Loading menu">
            <Skeleton className="h-11 w-full rounded-full" />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-[20px]" />
            ))}
          </div>
        )}
        {state && "error" in state && <Notice tone="error">{state.error}</Notice>}
        {state && "grid" in state && !grid && (
          <Notice>
            The menu for {dates.length > 1 ? "these days" : humanDate(dates[0])} isn&apos;t out yet. We&apos;ll use the
            default menu.
          </Notice>
        )}
        {grid && (
          <>
            {tabs.length > 1 && (
              <Segmented
                label="Eating day"
                idPrefix={PREFIX}
                value={activeDay}
                onChange={(d) => {
                  setDay(d);
                  setError(null);
                  setApplied(null);
                }}
                items={tabs.map((d) => ({ id: d, label: shortDay(d) }))}
              />
            )}
            {persons > 1 && (
              <Segmented
                label="Person"
                idPrefix="pick-person"
                value={String(who)}
                onChange={(v) => setPerson(Number(v))}
                items={Array.from({ length: persons }, (_, i) => ({ id: String(i + 1), label: `Person ${i + 1}` }))}
              />
            )}
            <div role="tabpanel" id={panelId(PREFIX, activeDay)} className="flex flex-col gap-5">
              <div>
                <h3 className="text-[17px] font-semibold">{humanDate(activeDay)}</h3>
                {lockNote && <p className={`text-[13px] ${muted}`}>{lockNote}</p>}
                {dayLocked && <p className={`text-[13px] ${muted}`}>Locked. Your picks for this day are final.</p>}
              </div>

              {appliedSwaps.length > 0 && (
                <section aria-label="Applied swaps" className="flex flex-col gap-2">
                  <h4 className={`text-[13px] font-semibold uppercase tracking-wide ${muted}`}>Exchanges today</h4>
                  {labelAppliedSwaps(appliedSwaps, labelOf, plan.swapCategories).map((text, i) => {
                    const s = appliedSwaps[i]!;
                    return (
                      <div
                        key={s.publicId}
                        className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--muted)] py-1 pl-4 pr-1"
                      >
                        <Chip tone="swap">{text}</Chip>
                        {!dayLocked && !swapLocked && (
                          <Button
                            variant="quiet"
                            pending={busy === s.publicId}
                            disabled={busy != null}
                            aria-label={`Remove swap ${text}`}
                            onClick={() => void removeSwap(s.publicId, text)}
                          >
                            <X aria-hidden className="size-4" />
                            Undo
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </section>
              )}

              {groups.map((group) => {
                const locked = dayLocked || group.cells.every((c) => c.locked);
                // Dish-pickable OR admin swap pairs from this category — never hardcode rice/roti/…
                const showRadios =
                  group.selectable || hasOutgoingSwapOptions(group.key, liveSwapOptions);

                if (!showRadios) {
                  const dish = group.dishes[0];
                  if (!dish && group.portions.length === 0) return null;
                  return (
                    <section key={group.key} aria-label={group.label} className="grid gap-1">
                      <h4 className={`text-[13px] font-semibold uppercase tracking-wide ${muted}`}>{group.label}</h4>
                      {group.portions.length > 1 ? (
                        group.portions.map((portion, i) => {
                          const cell = group.cells[i] ?? group.cells[0];
                          const cellDish = cell ? group.dishes.find((d) => d.id === effectiveDishId(cell, picked)) ?? group.dishes[0] : group.dishes[0];
                          return (
                            <p key={i} className="text-[15px]">
                              {cellDish?.name ?? group.label}
                              {portion ? <span className={muted}> · {portion}</span> : null}
                              <span className={`ml-2 ${muted}`}>Included</span>
                            </p>
                          );
                        })
                      ) : (
                        <p className="text-[15px]">
                          {dish?.name ?? group.label}
                          {group.portions[0] ? <span className={muted}> · {group.portions[0]}</span> : null}
                          <span className={`ml-2 ${muted}`}>Included</span>
                        </p>
                      )}
                    </section>
                  );
                }

                return (
                  <section key={group.key} aria-label={group.label} className="grid gap-4">
                    <h4 className={`text-[13px] font-semibold uppercase tracking-wide ${muted}`}>{group.label}</h4>
                    <div className="grid gap-5">
                      {group.cells.map((cell, i) => {
                        const selectedId = effectiveDishId(cell, picked);
                        const key = cellKey(cell);
                        const options = buildSlotDropdownOptions({
                          cellIndexInCategory: i,
                          categoryKey: group.key,
                          dishes: dishesAllowedByRules({
                            rules: grid?.mealRules ?? [],
                            category: group.key,
                            dishes: group.dishes,
                            selectedId,
                            others: mealPicks.filter((p) => p.key !== key),
                          }),
                          swapOptions: liveSwapOptions,
                          categoryLabel: labelOf,
                        });
                        const value = selectedId ? dishOptionValue(selectedId) : "";
                        const cellLocked = locked || cell.locked || (!group.selectable && swapLocked);
                        const label = slotLabel(group, i);
                        const isDefault =
                          !!selectedId && cell.isDefaulted && picked[key] == null;
                        return (
                          <div key={key} className="grid gap-2">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="text-[15px] font-semibold">{label}</p>
                              {isDefault && group.selectable && (
                                <p className={`text-[13px] ${muted}`}>Default pick</p>
                              )}
                            </div>
                            <ChoiceGroup
                              label={label}
                              value={value}
                              onChange={(v) => onSlotChange(cell, i, v)}
                              className="grid gap-2 sm:grid-cols-2"
                            >
                              {options.map((o) => (
                                <Choice
                                  key={o.value}
                                  value={o.value}
                                  disabled={cellLocked || busy != null || saving}
                                  className="min-h-12 w-full px-3.5 py-3 text-[15px] font-semibold"
                                >
                                  <span className="min-w-0 flex-1 text-left">
                                    <span className="block leading-snug">{o.label}</span>
                                    {o.kind === "swap" && (
                                      <span className={`mt-0.5 block text-[13px] font-normal ${muted}`}>
                                        Choose this instead
                                      </span>
                                    )}
                                  </span>
                                </Choice>
                              ))}
                            </ChoiceGroup>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              {summary.length > 0 && (
                <section aria-label="Your meal" className="border-t border-[var(--border,#E8E0D5)] pt-4">
                  <h3 className="text-[17px] font-semibold">Your meal</h3>
                  <div className="mt-3 grid gap-3">
                    {summary.map((block) => (
                      <div key={block.categoryLabel}>
                        <h4 className={`text-[13px] font-semibold uppercase tracking-wide ${muted}`}>
                          {block.categoryLabel}
                        </h4>
                        <ul className="mt-1 grid gap-0.5">
                          {block.lines.map((line) => (
                            <li key={`${block.categoryLabel}:${line}`} className="text-[15px]">
                              {line}
                            </li>
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
            <MealRuleNotes rules={grid?.rules ?? []} violatedRuleId={violatedRuleId} />
          </>
        )}
      </div>
    </Sheet>
  );
}
