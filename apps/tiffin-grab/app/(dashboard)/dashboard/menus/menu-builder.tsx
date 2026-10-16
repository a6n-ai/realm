"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Copy, Eye } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Skeleton } from "@foundry/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { WeeklyMenuPoster } from "@/components/marketing/weekly-menu-poster";
import { DAYS, DAY_LABELS, type DayOfWeek, type PosterItem } from "@/lib/menu/poster";
import type { MealTypeConfig } from "@/lib/menu/meal-types";
import { findSimilarDishes } from "@/lib/menu/similar-dishes";
import { CellPanel, cellWarning, MenuGrid, problemsByCell, rowsOf, type CellRef, type Slot } from "./menu-grid";
import { SideDefaultsDialog, SidePanel, sideKey, sideLabel, useSides, type DayDish, type SidesInput } from "./side-dishes-card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@foundry/ui/sheet";
import { Stepper, StepperIndicator, StepperItem, StepperNav, StepperSeparator, StepperTitle } from "@/components/reui/stepper";
import { amendImpact, backToDraft, copyWeek, createDish, markReady, releaseWeek, saveWeek } from "./actions";
import { cn } from "@foundry/ui/cn";
import { sanitizeClientError } from "@/lib/format/client-error";

type Dish = { id: string; name: string; category: string | null; planId: string };
type Week = { id: string; weekStart: string; status: string; updatedAt: number };
type Item = { id: string; dayOfWeek: string; slot: string; dishId: string; position: number; isDefault: boolean };
type Plan = { publicId: string; name: string };
type CopySource = { id: string; weekStart: string };
type ReleaseProblem = {
  kind: "missing" | "extra";
  day: string;
  planName: string;
  planPublicId: string;
  categoryKey: string;
  categoryLabel: string;
  dishNames: string[];
};
type AmendPreview = { resetPicks: number; affectedOrders: number; days: string[] };

/**
 * A row of the working copy. `key` is a stable React key that survives the row not yet
 * having a server id; `id` is null until the row has been saved.
 */
type Row = { key: string; id: string | null; dayOfWeek: DayOfWeek; slot: string; dishId: string; isDefault: boolean };

const toRows = (items: Item[]): Row[] =>
  items.map((i) => ({ key: i.id, id: i.id, dayOfWeek: i.dayOfWeek as DayOfWeek, slot: i.slot, dishId: i.dishId, isDefault: i.isDefault }));

// Identity of the working copy for dirty-checking. Array order carries position, so it is
// part of the signature — reordering two dishes is a real change.
const signature = (rows: Row[]) => JSON.stringify(rows.map((r) => [r.id, r.dayOfWeek, r.slot, r.dishId, r.isDefault]));

export function MenuBuilder({
  mealType, slots, plans, categoryCounts, dishes, week, items, copySources, problems, sides: sidesInput,
}: {
  /** Side items (Side 1/2) of meal sizes; their rows sit under the grid and edit in the same panel. */
  sides?: SidesInput;
  mealType: MealTypeConfig;
  slots: Slot[];
  plans: Plan[];
  categoryCounts: Record<string, number>;
  dishes: Dish[];
  week: Week;
  items: Item[];
  copySources: CopySource[];
  problems: ReleaseProblem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createTarget, setCreateTarget] = useState<{ storeDay: DayOfWeek; slot: Slot } | null>(null);
  const [newName, setNewName] = useState("");
  const [newPlanId, setNewPlanId] = useState("");

  // The working copy. Seeded once per mounted week — the page re-renders on every server
  // action, and re-seeding from props would throw away edits the admin has not saved yet.
  const [rows, setRows] = useState<Row[]>(() => toRows(items));
  const [savedSignature, setSavedSignature] = useState(() => signature(toRows(items)));
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(week.updatedAt);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [staleConflict, setStaleConflict] = useState(false);
  // Amending a released week is a deliberate mode, not a state the admin can wander into.
  const [amending, setAmending] = useState(false);
  const [amendPreview, setAmendPreview] = useState<AmendPreview | null>(null);
  // Dishes created in this session, before the page has re-fetched its dish list.
  const [createdDishes, setCreatedDishes] = useState<Dish[]>([]);
  // The poster is a check, not a workspace — it starts closed so the grid gets the width.
  const [showPreview, setShowPreview] = useState(false);
  const [selected, setSelected] = useState<CellRef | null>(null);
  const newKeyRef = useRef(0);

  const allDishes = useMemo(() => [...dishes, ...createdDishes], [dishes, createdDishes]);
  const dishById = useMemo(() => new Map(allDishes.map((d) => [d.id, d])), [allDishes]);
  const similarDishes = useMemo(() => findSimilarDishes(newName, allDishes), [newName, allDishes]);
  const dirty = signature(rows) !== savedSignature;
  const isDraft = week.status === "draft";
  const isReady = week.status === "ready";
  const isReleased = week.status === "released";
  const editable = isDraft || (isReleased && amending);

  // Actions return { error } instead of throwing — production redacts thrown
  // Server Action errors to "Minified React error #441".
  const run = (fn: () => Promise<void>) => start(async () => {
    setError(null);
    try { await fn(); }
    catch (e) { setError(sanitizeClientError(e, "Action failed. Please try again.")); }
  });

  const wireItems = useCallback(
    () => rows.map((r) => ({ id: r.id, dayOfWeek: r.dayOfWeek, slot: r.slot, dishId: r.dishId, isDefault: r.isDefault })),
    [rows],
  );

  const save = useCallback(async (opts?: { amend?: boolean }) => {
    if (!week) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveWeek({
        menuWeekId: week.id,
        expectedUpdatedAt,
        items: wireItems(),
        amend: opts?.amend,
      });
      if ("error" in result) {
        setError(sanitizeClientError(result.error));
        if (/another tab|reload/i.test(result.error)) setStaleConflict(true);
        return;
      }
      // Adopt the persisted rows so new items pick up their server ids without a page
      // refresh — the refresh-per-click was the other half of the old cost.
      const persisted = toRows(result.items);
      setRows(persisted);
      setSavedSignature(signature(persisted));
      setExpectedUpdatedAt(result.updatedAt);
      setSavedAt(Date.now());
      setStaleConflict(false);
      if (opts?.amend) {
        setAmending(false);
        setAmendPreview(null);
      }
      return result;
    } catch (e) {
      const message = sanitizeClientError(e, "Could not save");
      setError(message);
      if (/another tab|reload/i.test(message)) setStaleConflict(true);
    } finally {
      setSaving(false);
    }
  }, [week, expectedUpdatedAt, wireItems]);

  // Drafts stay local until Save or Done. Released-week amend already waits for an
  // explicit confirm — same rule for drafts so a half-built grid is not written by
  // a timer while the admin is still arranging dishes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const gapCount = problems.filter((p) => p.kind === "missing").length;

  // The customer-facing poster groups by category only, not per plan — it's a public
  // preview of "what's in the sabzi slot this week", not an admin tool.
  const posterSlots = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string }>();
    for (const s of slots) if (!byKey.has(s.categoryKey)) byKey.set(s.categoryKey, { key: s.categoryKey, label: s.categoryLabel });
    return [...byKey.values()];
  }, [slots]);

  const posterItems: PosterItem[] = rows.flatMap((r, index) => {
    const d = dishById.get(r.dishId);
    return d ? [{ dayOfWeek: r.dayOfWeek, slot: r.slot, dishName: d.name, position: index }] : [];
  });

  const addRow = (day: DayOfWeek, slot: string, dishId: string) =>
    setRows((prev) => [...prev, { key: `new-${newKeyRef.current++}`, id: null, dayOfWeek: day, slot, dishId, isDefault: false }]);

  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  // One default per (day, slot); clicking the current default clears it.
  const toggleDefault = (key: string) =>
    setRows((prev) => {
      const target = prev.find((r) => r.key === key);
      if (!target) return prev;
      const next = !target.isDefault;
      return prev.map((r) =>
        r.dayOfWeek === target.dayOfWeek && r.slot === target.slot
          ? { ...r, isDefault: r.key === key ? next : false }
          : r,
      );
    });

  // The frequent job: one category is usually the same all week. Replaces that category
  // on every other day with this day's dishes, defaults included.
  const copyAcrossDays = (from: DayOfWeek, slot: string) =>
    setRows((prev) => {
      const source = prev.filter((r) => r.dayOfWeek === from && r.slot === slot);
      const untouched = prev.filter((r) => r.slot !== slot || r.dayOfWeek === from);
      const copies = DAYS.filter((d) => d !== from).flatMap((day) =>
        source.map((r) => ({ ...r, key: `new-${newKeyRef.current++}`, id: null, dayOfWeek: day })),
      );
      return [...untouched, ...copies];
    });

  // Swap with the neighbour inside the same (day, slot) group; array order is position.
  const moveRow = (key: string, dir: -1 | 1) =>
    setRows((prev) => {
      const target = prev.find((r) => r.key === key);
      if (!target) return prev;
      const group = prev.filter((r) => r.dayOfWeek === target.dayOfWeek && r.slot === target.slot);
      const at = group.indexOf(target);
      const swapWith = group[at + dir];
      if (!swapWith) return prev;
      return prev.map((r) => (r.key === target.key ? swapWith : r.key === swapWith.key ? target : r));
    });

  const handleCreateDish = () => {
    const t = createTarget;
    if (!t || !week || !newName.trim() || !newPlanId) return;
    run(async () => {
      // Default the new dish's category and plan to the slot it was created in, so the
      // category guard accepts it and it stays scoped to that slot.
      const d = await createDish({ name: newName, category: t.slot.categoryKey, planId: newPlanId });
      if ("error" in d) {
        setError(sanitizeClientError(d.error));
        return;
      }
      setCreatedDishes((prev) => [...prev, { id: d.publicId, name: d.name, category: d.category, planId: d.planId }]);
      addRow(t.storeDay, t.slot.categoryKey, d.publicId);
      setCreateTarget(null);
      setNewName("");
      setNewPlanId("");
    });
  };

  const handleCopyWeek = (fromWeekId: string) => {
    if (!week) return;
    run(async () => {
      const res = await copyWeek({ fromWeekId, toWeekId: week.id });
      if ("error" in res) {
        setError(sanitizeClientError(res.error));
        return;
      }
      // The copy rewrote the week's items server-side. A full reload re-seeds the working
      // copy from them; merging into local state would just invent a second source of truth.
      window.location.reload();
    });
  };

  const handleRelease = () => {
    if (!week) return;
    run(async () => {
      if (dirty) {
        const saved = await save();
        if (!saved) return;
      }
      const res = await releaseWeek(week.id);
      if ("error" in res) {
        setError(sanitizeClientError(res.error));
        return;
      }
      router.refresh();
    });
  };

  // Ask the server what the amend costs before writing anything, so the confirm names a
  // real number rather than a generic "are you sure?".
  const handleReviewAmend = () => {
    if (!week) return;
    run(async () => {
      const res = await amendImpact({ menuWeekId: week.id, items: wireItems() });
      if ("error" in res) {
        setError(sanitizeClientError(res.error));
        return;
      }
      setAmendPreview(res);
    });
  };

  const statusLabel = saving
    ? "Saving…"
    : dirty
      ? "Unsaved changes"
      : savedAt
        ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "All changes saved";

  // The day's dishes from the working copy, so a side shows what it will pack before the menu is saved.
  const dayDishes = useMemo(() => {
    const out: Partial<Record<DayOfWeek, DayDish[]>> = {};
    for (const r of rows) {
      const d = dishById.get(r.dishId);
      if (!d) continue;
      const list = (out[r.dayOfWeek] ??= []);
      if (!list.some((x) => x.publicId === d.id)) list.push({ publicId: d.id, name: d.name, category: r.slot, isDefault: r.isDefault });
    }
    return out;
  }, [rows, dishById]);
  const sides = useSides(sidesInput, dayDishes);
  const sideRows = sides.slots.map((slot) => ({
    key: sideKey(slot),
    label: sideLabel(slot),
    sub: slot.meals.join(" · "),
    cell: (day: DayOfWeek) => (dayDishes[day]?.length ? { text: sides.packs(day, slot), changed: sides.changed(day, slot) } : { text: "—", changed: false }),
  }));

  // Where the week stands, said once: the stepper shows the lifecycle, this line what it means now.
  // One past the last step marks a released week complete.
  const stage = isReleased ? 4 : isReady ? 2 : 1;
  const stageLine = isDraft
    ? `${statusLabel}. A draft is not on the website: mark it ready when it is complete, then release it.`
    : isReady
      ? "Reviewed and frozen. Release it to put it on the website, or go back to draft to change it."
      : amending
        ? `Amending: ${saving ? "saving…" : dirty ? "unpublished changes" : "no changes yet"}. Changes go live only when you publish.`
        : "Live on the website.";

  const verdicts = problemsByCell(isReleased ? [] : problems);
  const firstGap = slots.flatMap((s) => DAYS.map((d) => ({ day: d, slotKey: s.key }))).find((c) => verdicts.get(`${c.day}:${c.slotKey}`)?.missing) ?? null;
  // The panel's cell: the admin's pick, else the first gap to fix, else Monday's first slot.
  const cell = selected ?? firstGap ?? (slots[0] ? { day: DAYS[0]!, slotKey: slots[0].key } : null);
  const cellSlot = cell ? slots.find((s) => s.key === cell.slotKey) ?? null : null;
  const sideSlot = cell ? sides.slots.find((s) => sideKey(s) === cell.slotKey) ?? null : null;
  const cellRows = cell && cellSlot ? rowsOf(rows, dishById, cell.day, cellSlot) : [];
  const cellNeeded = cellSlot ? categoryCounts[cellSlot.key] ?? 0 : 0;

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-destructive text-sm" role="alert">{error}</p> : null}

      <div className="bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3" data-testid="menu-status">
        <div className="flex min-w-0 flex-col gap-2">
          <Stepper value={stage} indicators={{ completed: <Check className="size-3.5" aria-hidden /> }} aria-label={`Menu ${isDraft ? "draft" : isReady ? "ready" : "released"}`}>
            <StepperNav className="items-center">
              {(["Draft", "Ready", "Released"] as const).map((label, i) => (
                <StepperItem key={label} step={i + 1} className="not-last:flex-none">
                  <StepperIndicator className={cn("size-6", isReleased && "data-[state=completed]:bg-emerald-600 data-[state=completed]:text-white dark:data-[state=completed]:bg-emerald-500")}>
                    <span className="text-xs">{i + 1}</span>
                  </StepperIndicator>
                  <StepperTitle className="ms-2 data-[state=inactive]:text-muted-foreground">{label}</StepperTitle>
                  {i < 2 && <StepperSeparator className={cn("mx-3 w-8 data-[state=completed]:bg-primary", isReleased && "data-[state=completed]:bg-emerald-600 dark:data-[state=completed]:bg-emerald-500")} />}
                </StepperItem>
              ))}
            </StepperNav>
          </Stepper>
          <p className="text-muted-foreground text-sm">{stageLine}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDraft && copySources.length > 0 && rows.length === 0 && (
            // A one-shot action, so DropdownMenu, not Select.
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline"><Copy data-icon="inline-start" />Copy from week…</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {copySources.map((src) => (
                  <DropdownMenuItem key={src.id} onSelect={() => handleCopyWeek(src.id)}>{src.weekStart}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="outline" onClick={() => setShowPreview(true)}><Eye data-icon="inline-start" />Preview</Button>
          {isDraft && (
            <>
              <Button variant="outline" disabled={saving || !dirty} onClick={() => void save()}>Save</Button>
              {/* Ready comes before release: it saves what is pending, then freezes the week for review. */}
              <Button disabled={pending || saving || rows.length === 0}
                onClick={() => run(async () => {
                  if (dirty) {
                    const saved = await save();
                    if (!saved) return;
                  }
                  const res = await markReady(week.id);
                  if ("error" in res) { setError(sanitizeClientError(res.error)); return; }
                  router.refresh();
                })}>
                Mark ready
              </Button>
            </>
          )}
          {isReady && (
            <Button variant="outline" disabled={pending}
              onClick={() => run(async () => {
                const res = await backToDraft(week.id);
                if ("error" in res) { setError(sanitizeClientError(res.error)); return; }
                router.refresh();
              })}>
              Back to draft
            </Button>
          )}
          {isReady && (
            <Button disabled={pending || saving || rows.length === 0} onClick={handleRelease}>Release menu</Button>
          )}
          {isReleased && !amending && <Button variant="outline" onClick={() => setAmending(true)}>Amend</Button>}
          {isReleased && amending && (
            <>
              <Button variant="outline" disabled={saving} onClick={() => { setRows(toRows(items)); setAmending(false); }}>Discard changes</Button>
              <Button disabled={pending || saving || !dirty} onClick={handleReviewAmend}>Review &amp; publish</Button>
            </>
          )}
        </div>
      </div>

      {gapCount > 0 && !isReleased && (
        <div className="border-warning/40 bg-warning/10 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm" data-testid="menu-gaps">
          <span>
            <span className="font-medium tabular-nums">{gapCount}</span> {gapCount === 1 ? "gap" : "gaps"} may leave some subscribers without a meal. They are marked Missing on the grid. You can still release.
          </span>
          {firstGap && <Button variant="outline" size="sm" onClick={() => setSelected(firstGap)}>Show first gap</Button>}
        </div>
      )}

      {staleConflict && (
        <div className="border-destructive/40 bg-destructive/5 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
          <span>This menu was changed somewhere else. Reload to see the current version; your unsaved edits here will be lost.</span>
          <Button variant="outline" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      )}

      {/* The week on the left, the selected cell beside it with everything that edits it. */}
      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <MenuGrid
          slots={slots}
          rows={rows}
          dishes={allDishes}
          categoryCounts={categoryCounts}
          problems={isReleased ? [] : problems}
          selected={cell}
          onSelect={setSelected}
          sideRows={sideRows}
          sideActions={<SideDefaultsDialog sides={sides} />}
        />
        <div className="lg:sticky lg:top-4">
          {cell && sideSlot ? (
            <SidePanel day={cell.day} slot={sideSlot} sides={sides} dishesOfDay={dayDishes[cell.day] ?? []} />
          ) : cell && cellSlot ? (
            <CellPanel
              day={cell.day}
              slot={cellSlot}
              needed={cellNeeded}
              rows={cellRows}
              dishes={allDishes}
              dishById={dishById}
              warning={cellWarning(cellSlot, cellNeeded, cellRows.length, verdicts.get(`${cell.day}:${cellSlot.key}`))}
              editable={editable}
              onAdd={(day, slot, dishId) => addRow(day, slot.categoryKey, dishId)}
              onRemove={removeRow}
              onMove={moveRow}
              onToggleDefault={toggleDefault}
              onCopyAcrossDays={(day, slot) => copyAcrossDays(day, slot.categoryKey)}
              onCreateDish={(storeDay, slot) => { setNewName(""); setNewPlanId(slot.planPublicId); setCreateTarget({ storeDay, slot }); }}
            />
          ) : (
            <p className="text-muted-foreground rounded-xl border p-4 text-sm">No slots to fill. Add meal sizes in the Catalog first.</p>
          )}
          {isReleased && !amending && !sideSlot && <p className="text-muted-foreground mt-2 text-xs">Released menus are read-only. Use Amend to change them.</p>}
        </div>
      </div>

      {/* The poster is a check, not a workspace: it opens wide in a sheet instead of squeezing the grid. */}
      <Sheet open={showPreview} onOpenChange={setShowPreview}>
        <SheetContent side="right" className="w-full data-[side=right]:sm:max-w-4xl">
          <SheetHeader>
            <SheetTitle>Website preview</SheetTitle>
            <SheetDescription>What customers see for this week{isReleased && !amending ? "" : ", including unsaved changes"}.</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-4">
            <WeeklyMenuPoster titlePrefix={mealType.titlePrefix} weekStart={week.weekStart} slots={posterSlots} items={posterItems} accent={mealType.accent} />
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!amendPreview} onOpenChange={(o) => { if (!o) setAmendPreview(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Publish changes to a live menu</DialogTitle></DialogHeader>
          {amendPreview && (
            <div className="space-y-3 text-sm">
              {amendPreview.resetPicks === 0 ? (
                <p>No customer has chosen a dish you removed, so nobody&apos;s meal changes.</p>
              ) : (
                <>
                  <p>
                    <span className="font-medium tabular-nums">{amendPreview.resetPicks}</span> customer
                    {amendPreview.resetPicks === 1 ? " choice" : " choices"} across{" "}
                    <span className="font-medium tabular-nums">{amendPreview.affectedOrders}</span>{" "}
                    {amendPreview.affectedOrders === 1 ? "order" : "orders"} point at a dish you removed.
                    Publishing resets {amendPreview.resetPicks === 1 ? "it" : "them"} to that day&apos;s default.
                  </p>
                  <p className="text-muted-foreground">
                    Affected days: {amendPreview.days.map((d) => DAY_LABELS[d as DayOfWeek] ?? d).join(", ")}
                  </p>
                </>
              )}
              <p className="text-muted-foreground">The website updates as soon as you publish.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAmendPreview(null)} disabled={saving}>Keep editing</Button>
            <Button className="transition-transform active:scale-[0.96]" disabled={saving}
              onClick={() => { void save({ amend: true }); }}>
              Publish changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!createTarget} onOpenChange={(o) => { if (!o) setCreateTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>New dish</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Dish name"
              value={newName}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateDish(); }}
            />
            {similarDishes.length > 0 && createTarget ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                <p className="mb-1.5 font-medium">Already in the catalog. Use one instead?</p>
                <ul className="space-y-1">
                  {similarDishes.map((d) => {
                    // The grid only renders a dish in a slot of its own plan, so "Use" is
                    // offered only where it would actually show up.
                    const fits = d.planId === createTarget.slot.planPublicId
                      && (d.category == null || d.category === createTarget.slot.categoryKey);
                    return (
                      <li key={d.id} className="flex items-center justify-between gap-2">
                        <span>{d.name}{fits ? "" : ` · ${plans.find((p) => p.publicId === d.planId)?.name ?? "other plan"}${d.category ? `, ${d.category}` : ""}`}</span>
                        {fits ? (
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs"
                            onClick={() => { addRow(createTarget.storeDay, createTarget.slot.categoryKey, d.id); setCreateTarget(null); setNewName(""); }}>
                            Use
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {/* Defaults to the slot's own plan — a dish belongs to exactly one plan, so this
                is what actually decides which subscribers can ever be served it. */}
            <Select value={newPlanId} onValueChange={setNewPlanId}>
              <SelectTrigger><SelectValue placeholder="Pick a plan" /></SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.publicId} value={p.publicId}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Tip: include &quot;Egg&quot; in the name for a yellow indicator.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateTarget(null)} disabled={pending}>Cancel</Button>
            <Button onClick={handleCreateDish} disabled={pending || !newName.trim() || !newPlanId} className="transition-transform active:scale-[0.96]">Create &amp; add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Loading twin of the editor's status bar — the first thing that paints, so the page
// does not jump when the grid arrives.
export function MenuBuilderSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading menu">
      <div className="bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="grid grid-cols-8 overflow-hidden rounded-xl border">
          {Array.from({ length: 64 }, (_, i) => <div key={i} className="h-14 border-e border-b p-2"><Skeleton className="h-3 w-3/4" /></div>)}
        </div>
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-5 w-40" />
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
    </div>
  );
}
