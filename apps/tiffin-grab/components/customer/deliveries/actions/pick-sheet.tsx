"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadPickGrid, type PickGrid } from "@/app/(customer)/me/deliveries/pick-grid";
import {
  applyMyDeliverySwap,
  removeMyDeliverySwap,
} from "@/app/(customer)/me/deliveries/actions";
import { saveMyMealSelections, type PickItem } from "@/app/(customer)/me/meals/actions";
import { Button, Notice, Reason, Segmented, Sheet, Skeleton, panelId } from "@/components/customer/kit";
import { actionAvailability, formatCutoff, humanDate } from "@/lib/deliveries-view";
import type { GridCell } from "@/lib/menu/meals-grid";
import type { SwapOption } from "@/lib/menu/meal-validation";
import { foldProvisionalCells, previewPortions, previewSwapOptions, type ProvisionalSwap } from "@/lib/menu/pick-preview";
import {
  anchorSwaps,
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
  parseSlotOptionValue,
  swapOptionValue,
  type SlotDropdownOption,
} from "@/lib/menu/slot-dropdown";
import { swapAmounts, swapLabel } from "@/lib/menu/swap-rules";
import { sanitizeClientError } from "@/lib/format/client-error";
import { CategorySection, ChoiceRow, type RowChoice } from "./choice-row";
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
  // One eating day per sheet: the day the customer opened it from (a trip can carry several).
  const dates = useMemo(
    () => [startDay && trip.coversDates.includes(startDay) ? startDay : trip.date],
    [startDay, trip.coversDates, trip.date],
  );
  // Tiffins moved onto this day share its menu — one set of picks covers them all.
  const tiffinsThisDay = 1 + (trip.extraDates ?? []).filter((d) => d === dates[0]).length;

  const [state, setState] = useState<{ grid: PickGrid | null } | { error: string } | null>(null);
  const [day, setDay] = useState(startDay && dates.includes(startDay) ? startDay : dates[0]);
  const [person, setPerson] = useState(1);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which rule refused the last pick, so its line stands out in the list above.
  const [violatedRuleId, setViolatedRuleId] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  // Category swaps stay local until Done — same batching as dish picks, so packing
  // labels do not change while the sheet is still open.
  const [pendingApplies, setPendingApplies] = useState<
    { id: string; day: string; fromCategory: string; toCategory: string; fromPicks: number; toPicks: number; fromRow: number | null }[]
  >([]);
  // Each removal keeps its own eating day: the tab open at Save time may be another day.
  const [pendingRemoves, setPendingRemoves] = useState<{ publicId: string; day: string }[]>([]);
  // A dish tapped on a swapped row: the swap is undone and, once that row is back, it gets this dish.
  const [pendingPick, setPendingPick] = useState<{ day: string; person: number; category: string; row: number; dishId: string } | null>(null);
  // The dish tapped with a swap into a category with a choice (Daal → Paneer Makhani): set once the swap folds in.
  const [pendingToPick, setPendingToPick] = useState<{ swapId: string; dishId: string } | null>(null);

  const labelOf = useCallback((k: string) => plan.categoryLabels[k] ?? k, [plan.categoryLabels]);
  const source = plan.days.find((d) => d.date === trip.date);
  const eating = source?.eatingDays?.find((e) => e.date === day);
  const appliedSwaps = eating?.appliedSwaps ?? [];

  useEffect(() => {
    let live = true;
    loadPickGrid(plan.orderId, dates)
      .then((r) => live && setState("error" in r ? r : { grid: r.grid }))
      .catch(() => live && setState({ error: "Couldn't load the menu. Try again." }));
    return () => {
      live = false;
    };
  }, [plan.orderId, dates]);

  // Only saved swaps need the server: undoing one restores rows whose default dishes it resolves.
  // Unsaved swaps fold in locally (pick-preview), so a swap tap never reloads the menu.
  const refreshGrid = async (removes = pendingRemoves) => {
    try {
      const r = await loadPickGrid(plan.orderId, dates, { omitSwapPublicIds: removes.map((r) => r.publicId) });
      if ("error" in r) {
        setError(sanitizeClientError(r.error));
        return;
      }
      setState({ grid: r.grid });
    } catch {
      setError("Couldn't refresh the menu. Try again.");
    }
  };

  const provisional: ProvisionalSwap[] = pendingApplies.map((p) => ({
    forDate: p.day, fromCategory: p.fromCategory, toCategory: p.toCategory, qtyFrom: p.fromPicks, qtyTo: p.toPicks, fromRow: p.fromRow,
  }));
  const serverGrid = state && "grid" in state ? state.grid : null;
  const grid: PickGrid | null = !serverGrid || provisional.length === 0
    ? serverGrid
    : {
      ...serverGrid,
      cells: foldProvisionalCells({ cells: serverGrid.cells, categories: serverGrid.categories, base: serverGrid.preview, provisional }),
      portionsByDate: {
        ...serverGrid.portionsByDate,
        ...Object.fromEntries([...new Set(provisional.map((p) => p.forDate))].map((d) => [d, previewPortions(serverGrid.preview, d, provisional)])),
      },
    };
  const tabs = grid ? dates.filter((d) => grid.cells.some((c) => c.dateIso === d)) : [];
  const activeDay = tabs.includes(day) ? day : tabs[0];
  const persons = grid?.persons ?? 1;
  const who = Math.min(person, persons);
  const cells = grid?.cells.filter((c) => c.dateIso === activeDay && c.personIndex === who) ?? [];
  const lockNote = cells.find((c) => c.lockNote)?.lockNote ?? null;
  const dayLocked = closed || (cells.length > 0 && cells.every((c) => c.locked));
  // A swap into a fixed category brings that day's one dish; name it instead of the category.
  const destinationName = (key: string): string | undefined => {
    if (!grid || grid.categories.find((c) => c.key === key)?.selectable) return undefined;
    const cell = cells.find((c) => c.slot === key);
    return cell?.dishes.find((d) => d.id === cell.selectedDishId)?.name ?? grid.menu?.[activeDay!]?.[key]?.[0]?.name;
  };
  // A swap into a category with a choice is offered per dish, greyed where a meal rule refuses it.
  const destinationDishes = (key: string) => {
    if (!grid?.categories.find((c) => c.key === key)?.selectable) return undefined;
    const menu = grid.menu?.[activeDay!]?.[key] ?? cells.find((c) => c.slot === key)?.dishes ?? [];
    const blocked = blockedDishes(key, menu, null);
    return menu.map((d) => ({ id: d.id, name: d.name, disabled: blocked.has(d.id), reason: blocked.has(d.id) ? "Not allowed with your other picks" : undefined }));
  };
  const swapOptions: SwapOption[] =
    !open || swapLocked || !trip.deliveryId || !serverGrid || !activeDay ? [] : previewSwapOptions(serverGrid.preview, activeDay, provisional);

  const visibleSwaps = [
    ...appliedSwaps
      .filter((s) => !pendingRemoves.some((r) => r.publicId === s.publicId))
      .map((s) => ({ ...s, pending: false as const })),
    ...pendingApplies
      .filter((p) => p.day === activeDay)
      .map((p) => ({
        publicId: `pending:${p.id}`,
        fromCategory: p.fromCategory,
        toCategory: p.toCategory,
        qtyFrom: p.fromPicks,
        qtyTo: p.toPicks,
        fromRow: p.fromRow,
        pending: true as const,
      })),
  ];

  const groups = grid
    ? groupPickCells(cells, grid.categories, grid.portionsByDate[activeDay!] ?? grid.portionsBySlot)
    : [];
  // Exchanged rows stay where they were (Sabzi · 12oz → Daal), instead of jumping to the new category.
  const rows = grid
    ? anchorSwaps({
      groups,
      swaps: visibleSwaps,
      categories: grid.categories,
      basePortions: grid.portionsBySlot,
      amounts: (s) => swapAmounts(plan.swapCategories[s.fromCategory], plan.swapCategories[s.toCategory], s.qtyFrom, s.qtyTo),
    })
    : [];
  if (pendingToPick) {
    const into = rows
      .flatMap((g) => g.swapped)
      .find((sw) => sw.swap.publicId === `pending:${pendingToPick.swapId}`)?.toCells[0];
    if (into) {
      if (into.selectable) setPicked((p) => ({ ...p, [cellKey(into)]: pendingToPick.dishId }));
      setPendingToPick(null);
    }
  }
  if (pendingPick) {
    const back = pendingPick.day === activeDay && pendingPick.person === who
      ? rows.find((g) => g.key === pendingPick.category)?.items.find((it) => it.kind === "cell" && it.row === pendingPick.row)
      : undefined;
    // Adjusting state while rendering (not in an effect): the restored row shows the dish on its first paint.
    if (back?.kind === "cell") {
      const key = cellKey(back.cell);
      if (back.cell.selectable) setPicked((p) => ({ ...p, [key]: pendingPick.dishId }));
      setPendingPick(null);
    }
  }
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
    options: swapOptions.filter((o) => o.available),
    mealPicks: [...mealPicks].sort((a, b) => a.pickIndex - b.pickIndex),
    menuByCategory: new Map(groups.map((g) => [g.key, g.dishes])),
  });
  const allowedSwaps = new Set(
    liveSwapOptions.flatMap((o) => o.validBundles.map((b) => swapOptionValue(o.fromCategory, o.toCategory, b.fromPicks))),
  );
  // Dishes a meal rule refuses for this cell stay visible, greyed out.
  const blockedDishes = (category: string, dishes: GridCell["dishes"], cell: GridCell | null) => {
    const selectedId = cell ? effectiveDishId(cell, picked) : null;
    const key = cell ? cellKey(cell) : null;
    const allowed = new Set(
      dishesAllowedByRules({
        rules: grid?.mealRules ?? [],
        category,
        dishes,
        selectedId,
        others: mealPicks.filter((p) => p.key !== key),
      }).map((d) => d.id),
    );
    return new Set(dishes.filter((d) => !allowed.has(d.id)).map((d) => d.id));
  };

  const queueSwap = async (fromCategory: string, toCategory: string, fromPicks: number, fromRow: number | null, toDishId: string | null) => {
    if (!trip.deliveryId || swapLocked || activeDay == null) return;
    const option = swapOptions.find((o) => o.fromCategory === fromCategory && o.toCategory === toCategory);
    const bundle = option?.validBundles.find((b) => b.fromPicks === fromPicks) ?? option?.validBundles[0];
    const toPicks = bundle?.toPicks ?? fromPicks;
    const swapId = Math.random().toString(36).slice(2);
    const nextApplies = [
      ...pendingApplies,
      { id: swapId, day: activeDay, fromCategory, toCategory, fromPicks, toPicks, fromRow },
    ];
    setPendingApplies(nextApplies);
    if (toDishId) setPendingToPick({ swapId, dishId: toDishId });
    setTouched(true);
    setError(null);
    setApplied(`Swapped to ${labelOf(toCategory)} — press Save to keep it.`);
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
    // A swap without its own row takes the leading row — ignore stale option values elsewhere.
    if (parsed.fromRow == null && cellIndexInCategory !== 0) return;
    void queueSwap(parsed.fromCategory, parsed.toCategory, parsed.fromPicks, parsed.fromRow, parsed.toDishId);
  };

  const queueRemoveSwap = async (publicId: string, text: string) => {
    if (!trip.deliveryId || busy != null) return;
    setError(null);
    if (publicId.startsWith("pending:")) {
      const swapId = publicId.replace("pending:", "");
      setPendingApplies((prev) => prev.filter((p) => p.id !== swapId));
      setTouched(true);
      setApplied(`Removed ${text}`);
      return;
    }
    setBusy(publicId);
    try {
      const nextRemoves = pendingRemoves.some((r) => r.publicId === publicId)
        ? pendingRemoves
        : [...pendingRemoves, { publicId, day: activeDay! }];
      setPendingRemoves(nextRemoves);
      setTouched(true);
      setApplied(`Removed ${text}`);
      await refreshGrid(nextRemoves);
    } finally {
      setBusy(null);
    }
  };

  const changedPicks: PickItem[] = [];
  if (grid) {
    for (const c of grid.cells) {
      if (!c.selectable) continue;
      const chosenDishId = picked[cellKey(c)];
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
  const hasSwapWork = pendingApplies.length > 0 || pendingRemoves.length > 0;
  const dirty = hasSwapWork || changedPicks.length > 0;

  const handleDone = async () => {
    if (saving || busy != null) return;
    if (!dirty) {
      onDone(touched ? "Meals saved" : undefined);
      return;
    }

    if (!trip.deliveryId && hasSwapWork) {
      setError("Couldn't save that exchange. Try again.");
      return;
    }

    setSaving(true);
    setError(null);
    setViolatedRuleId(null);
    // Each call commits on its own; drop what the server accepted so a retry after a
    // failure never re-removes (error) or re-applies (duplicate swap) it.
    // Newest first: an older swap can't go while a later one still uses what it gave.
    const appliedAt = new Map(
      plan.days.flatMap((d) => (d.eatingDays ?? []).flatMap((e) => e.appliedSwaps.map((sw) => sw.publicId))).map((id, i) => [id, i]),
    );
    let removes = [...pendingRemoves].sort((a, b) => (appliedAt.get(b.publicId) ?? 0) - (appliedAt.get(a.publicId) ?? 0));
    let applies = pendingApplies;
    try {
      while (removes.length > 0) {
        const r = await removeMyDeliverySwap(trip.deliveryId!, removes[0]!.publicId, removes[0]!.day);
        if ("error" in r) throw new Error(r.error);
        removes = removes.slice(1);
      }
      while (applies.length > 0) {
        const p = applies[0]!;
        const r = await applyMyDeliverySwap(trip.deliveryId!, p.fromCategory, p.toCategory, p.fromPicks, p.day, p.fromRow);
        if ("error" in r) throw new Error(r.error);
        applies = applies.slice(1);
      }
      if (changedPicks.length > 0) {
        const r = await saveMyMealSelections({
          orderId: plan.orderId,
          picks: changedPicks,
        });
        if ("error" in r) {
          setViolatedRuleId(r.violatedRuleId ?? null);
          throw new Error(r.error);
        }
      }
      if (onChanged) onChanged("Meals saved");
      onDone("Meals saved");
    } catch (e) {
      setError(sanitizeClientError(e, "Couldn't save that pick. Try again."));
      // Part of the batch is committed: refresh so saved swaps show as saved, not pending.
      if (removes.length !== pendingRemoves.length || applies !== pendingApplies) {
        onChanged?.("Some changes saved");
        void refreshGrid(removes);
      }
    } finally {
      setPendingRemoves(removes);
      setPendingApplies(applies);
      setSaving(false);
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
      {dirty ? "Save" : "Done"}
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
                {tiffinsThisDay > 1 && (
                  <p className={`text-[13px] ${muted}`}>{tiffinsThisDay} tiffins this day — same meal for each.</p>
                )}
                {lockNote && <p className={`text-[13px] ${muted}`}>{lockNote}</p>}
                {dayLocked && <p className={`text-[13px] ${muted}`}>Locked. Your picks for this day are final.</p>}
              </div>

              {rows.map((group) => {
                const locked = dayLocked || (group.cells.length > 0 && group.cells.every((c) => c.locked));
                const controlsOff = busy != null || saving;
                // The category's own dishes, even when swaps took every row of it.
                const ownDishes = group.dishes.length ? group.dishes : grid.menu?.[activeDay!]?.[group.key] ?? [];
                return (
                  <CategorySection key={group.key} label={group.label}>
                    {group.items.map((item) => {
                      if (item.kind === "swapped") {
                        const row = item.swapped;
                        const text = swapLabel(row.swap, labelOf, plan.swapCategories);
                        const rowOff = locked || swapLocked || controlsOff;
                        const toName = row.toCells.length && !row.toCells[0]!.selectable
                          ? row.toDishes.find((d) => d.id === row.toCells[0]!.selectedDishId)?.name ?? row.toDishes[0]?.name
                          : undefined;
                        // The row's own dishes stay choices: tapping one undoes the swap and picks it.
                        const blockedOwn = blockedDishes(group.key, ownDishes, null);
                        const into = row.toCells[0];
                        const blockedInto = into?.selectable ? blockedDishes(row.swap.toCategory, row.toDishes, into) : new Set<string>();
                        const intoPick = into?.selectable ? effectiveDishId(into, picked) : null;
                        const choices: RowChoice[] = [
                          ...(ownDishes.length ? ownDishes : [{ id: "category", name: group.label }])
                            .map((d) => ({
                              value: `was:${d.id}`,
                              label: d.name,
                              reason: blockedOwn.has(d.id) ? "Not allowed with your other picks" : undefined,
                              disabled: rowOff || blockedOwn.has(d.id),
                            })),
                          // What it became: the destination's dishes when there is a choice, else its one name.
                          ...(into?.selectable
                            ? row.toDishes.map((d) => ({
                              value: `to:${d.id}`,
                              label: d.name,
                              reason: blockedInto.has(d.id) ? "Not allowed with your other picks" : undefined,
                              disabled: rowOff || into.locked || blockedInto.has(d.id),
                            }))
                            : [{
                              value: "swapped",
                              // The size only when it differs from the row's (8 roti → 2 rice).
                              label: `${toName ?? labelOf(row.swap.toCategory)}${row.getPortion && row.getPortion !== row.givePortion ? ` · ${row.getPortion}` : ""}`,
                              disabled: rowOff,
                            }]),
                        ];
                        return (
                          <ChoiceRow
                            key={`${row.swap.publicId}#${row.part}`}
                            label={row.givePortion ? `${group.label} · ${row.givePortion}` : group.label}
                            choices={choices}
                            value={into?.selectable ? (intoPick ? `to:${intoPick}` : "") : "swapped"}
                            onChange={(v) => {
                              if (rowOff) return;
                              if (v.startsWith("to:") && into) return onSlotChange(into, 1, dishOptionValue(v.slice("to:".length)));
                              if (!v.startsWith("was:")) return;
                              const dishId = v.slice("was:".length);
                              if (row.givenRow != null && dishId !== "category") {
                                setPendingPick({ day: activeDay!, person: who, category: group.key, row: row.givenRow, dishId });
                              }
                              void queueRemoveSwap(row.swap.publicId, text);
                            }}
                          >
                            {/* A swap bringing several picks: the first is on the row, the rest get their own. */}
                            {row.toCells.slice(1).filter((c) => c.selectable).map((cell, n) => {
                              const i = n + 1;
                              const subLabel = `${labelOf(row.swap.toCategory)}${row.toCells.length > 1 ? ` ${i + 1}` : ""}`;
                              const selectedId = effectiveDishId(cell, picked);
                              const blocked = blockedDishes(row.swap.toCategory, row.toDishes, cell);
                              return (
                                <ChoiceRow
                                  key={cellKey(cell)}
                                  nested
                                  label={`Pick your ${subLabel}`}
                                  choices={row.toDishes.map((d) => ({
                                    value: dishOptionValue(d.id),
                                    label: d.name,
                                    disabled: locked || cell.locked || controlsOff || blocked.has(d.id),
                                  }))}
                                  value={selectedId ? dishOptionValue(selectedId) : ""}
                                  // A non-zero index: this cell only ever takes dish picks.
                                  onChange={(v) => onSlotChange(cell, 1, v)}
                                />
                              );
                            })}
                          </ChoiceRow>
                        );
                      }
                      const { cell, index: i, row: baseRow } = item;
                      const selectedId = effectiveDishId(cell, picked);
                      const key = cellKey(cell);
                      const built = buildSlotDropdownOptions({
                        cellIndexInCategory: i,
                        categoryKey: group.key,
                        dishes: group.dishes,
                        disabledDishIds: blockedDishes(group.key, group.dishes, cell),
                        swapOptions,
                        allowedSwaps,
                        onePerRow: group.cells.every((c) => c.quantity === 1),
                        fromRow: baseRow,
                        categoryLabel: labelOf,
                        destinationName,
                        destinationDishes,
                      });
                      // A fixed item with no dish on the menu still gets its (greyed) box.
                      const options: SlotDropdownOption[] = built.length
                        ? built
                        : [{ kind: "dish", value: "fixed", label: group.label, dishId: "" }];
                      const cellOff = locked || cell.locked || controlsOff;
                      const isDefault = !!selectedId && cell.isDefaulted && picked[key] == null;
                      return (
                        <ChoiceRow
                          key={key}
                          label={slotLabel(group, i)}
                          hint={!cell.selectable ? "Included" : isDefault ? "Default pick" : undefined}
                          choices={options.map((o) => ({
                            value: o.value,
                            label: o.label,
                            reason: o.reason,
                            disabled:
                              cellOff
                              || !!o.disabled
                              // A fixed dish is never a choice; its box stays, greyed.
                              || (o.kind === "dish" && !cell.selectable)
                              || (o.kind === "swap" && swapLocked),
                          }))}
                          value={selectedId ? dishOptionValue(selectedId) : built.length ? "" : "fixed"}
                          onChange={(v) => onSlotChange(cell, i, v)}
                        />
                      );
                    })}
                  </CategorySection>
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
                          {block.lines.map((line, n) => (
                            <li key={`${block.categoryLabel}:${n}`} className="text-[15px]">
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
