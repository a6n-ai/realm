"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CheckCircle2, Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Skeleton } from "@foundry/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { WeeklyMenuPoster } from "@/components/marketing/weekly-menu-poster";
import { DAYS, DAY_LABELS, type DayOfWeek, type PosterItem } from "@/lib/menu/poster";
import type { MealTypeConfig } from "@/lib/menu/meal-types";
import { MenuGrid, type Slot } from "./menu-grid";
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
  mealType, slots, plans, categoryCounts, dishes, week, items, copySources, problems,
}: {
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
  const newKeyRef = useRef(0);

  const allDishes = useMemo(() => [...dishes, ...createdDishes], [dishes, createdDishes]);
  const dishById = useMemo(() => new Map(allDishes.map((d) => [d.id, d])), [allDishes]);
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

  const handleDone = () => {
    run(async () => {
      if (dirty) {
        const saved = await save();
        if (!saved) return;
      }
      router.push("/dashboard/menus");
    });
  };

  // One line per (plan, day) rather than per missing category — see the banner below.
  const problemGroups = useMemo(() => {
    const byKey = new Map<string, { key: string; planName: string; dayLabel: string; categories: string[] }>();
    for (const p of problems) {
      if (p.kind !== "missing") continue; // surplus never blocks a release
      const key = `${p.planName}|${p.day}`;
      const existing = byKey.get(key);
      if (existing) existing.categories.push(p.categoryLabel);
      else
        byKey.set(key, {
          key,
          planName: p.planName,
          dayLabel: DAY_LABELS[p.day as DayOfWeek] ?? p.day,
          categories: [p.categoryLabel],
        });
    }
    return [...byKey.values()];
  }, [problems]);

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

  return (
    <div className="space-y-6">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {(
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-l-2 bg-muted/30 p-4 ${isReleased ? "border-l-ok" : isReady ? "border-l-primary" : "border-l-muted-foreground/30"}`}>
          <div className="flex items-center gap-2 text-sm">
            {isDraft && (
              <>
                <CheckCircle2 className={cn("size-4", dirty || saving ? "text-muted-foreground" : "text-ok")} />
                <span className="font-medium">{statusLabel}</span>
                <span className="text-muted-foreground">— a draft is not on the website.</span>
              </>
            )}
            {isReady && (
              <>
                <CheckCircle2 className="size-4 text-primary" />
                <span className="font-medium text-primary">Ready</span>
                <span className="text-muted-foreground">— reviewed and frozen, not yet on the website.</span>
              </>
            )}
            {isReleased && (
              <>
                <CheckCircle2 className="size-4 text-ok" />
                <span className="font-medium text-ok">Released</span>
                <span className="text-muted-foreground">
                  {amending ? `— amending. ${statusLabel}.` : "— live on the website."}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isDraft && copySources.length > 0 && rows.length === 0 && (
              // A one-shot action, so DropdownMenu — not Select. A Select models persistent
              // state; using one here meant resetting it with a controlled value="" , which
              // left the trigger showing a stale week and stopped onValueChange re-firing.
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9 transition-transform active:scale-[0.96]">
                    <Copy className="size-3.5" />
                    Copy from week…
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {copySources.map((src) => (
                    <DropdownMenuItem key={src.id} onSelect={() => handleCopyWeek(src.id)}>
                      {src.weekStart}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {isDraft && (
              <>
                <Button variant="outline" className="transition-transform active:scale-[0.96]" disabled={saving || !dirty} onClick={() => void save()}>
                  Save
                </Button>
                <Button variant="outline" className="transition-transform active:scale-[0.96]" disabled={pending || saving || dirty || rows.length === 0}
                  onClick={() => run(async () => {
                    const res = await markReady(week.id);
                    if ("error" in res) { setError(sanitizeClientError(res.error)); return; }
                    router.refresh();
                  })}>
                  Mark ready
                </Button>
              </>
            )}

            {isReady && (
              <Button variant="outline" className="transition-transform active:scale-[0.96]" disabled={pending}
                onClick={() => run(async () => {
                  const res = await backToDraft(week.id);
                  if ("error" in res) { setError(sanitizeClientError(res.error)); return; }
                  router.refresh();
                })}>
                Back to draft
              </Button>
            )}

            {(isDraft || isReady) && (
              <Button variant="default" className="transition-transform active:scale-[0.96]" disabled={pending || saving || rows.length === 0} onClick={handleRelease}>
                Release menu
              </Button>
            )}

            {isReleased && !amending && (
              <Button variant="outline" className="transition-transform active:scale-[0.96]" onClick={() => setAmending(true)}>
                Amend
              </Button>
            )}
            {isReleased && amending && (
              <>
                <Button variant="outline" className="transition-transform active:scale-[0.96]" disabled={saving}
                  onClick={() => { setRows(toRows(items)); setAmending(false); }}>
                  Discard changes
                </Button>
                <Button variant="default" className="transition-transform active:scale-[0.96]" disabled={pending || saving || !dirty} onClick={handleReviewAmend}>
                  Review &amp; publish
                </Button>
              </>
            )}

            <Button variant="outline" className="transition-transform active:scale-[0.96]" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {showPreview ? "Hide preview" : "Preview"}
            </Button>
            <Button variant="outline" className="transition-transform active:scale-[0.96]" disabled={pending || saving} onClick={handleDone}>
              Done
            </Button>
          </div>
        </div>
      )}

      {gapCount > 0 && !isReleased && (
        <div className="rounded-xl border border-warn/40 bg-warn/5 p-4 text-sm">
          <p className="font-medium">
            Warning — <span className="tabular-nums">{gapCount}</span>{" "}
            {gapCount === 1 ? "gap" : "gaps"} may leave some subscribers without a meal.
            You can still release.
          </p>
          {/* Grouped, and collapsed by default. One row per missing (plan, day, category) is
              O(plans x days x categories): a week built across all seven days produced ~84
              rows and pushed the grid off screen entirely. Grouping to one line per plan+day
              turns that into ~14, and <details> keeps the banner a summary until asked. */}
          <details className="group mt-2">
            <summary className="cursor-pointer text-muted-foreground underline-offset-2 hover:underline">
              Show what is missing
            </summary>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {problemGroups.map((g) => (
                <li key={g.key}>
                  <span className="font-medium text-foreground">{g.planName}</span> — {g.dayLabel}:{" "}
                  {g.categories.join(", ")}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {staleConflict && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <span>This menu was changed somewhere else. Reload to see the current version — your unsaved edits here will be lost.</span>
          <Button variant="outline" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      )}

      {(
        <div className={cn("grid gap-6", showPreview && "lg:grid-cols-[minmax(0,1fr)_24rem]")}>
          <MenuGrid
            slots={slots}
            rows={rows}
            dishes={allDishes}
            categoryCounts={categoryCounts}
            problems={isReleased ? [] : problems}
            editable={editable}
            onAdd={(day, slot, dishId) => addRow(day, slot.categoryKey, dishId)}
            onRemove={removeRow}
            onMove={moveRow}
            onToggleDefault={toggleDefault}
            onCopyAcrossDays={(day, slot) => copyAcrossDays(day, slot.categoryKey)}
            onCreateDish={(storeDay, slot) => { setNewName(""); setNewPlanId(slot.planPublicId); setCreateTarget({ storeDay, slot }); }}
          />

          {showPreview && (
            <div className="lg:sticky lg:top-4 lg:self-start">
              <p className="mb-3 text-xs font-medium text-muted-foreground">Live preview</p>
              <WeeklyMenuPoster titlePrefix={mealType.titlePrefix} weekStart={week.weekStart} slots={posterSlots} items={posterItems} accent={mealType.accent} />
            </div>
          )}
        </div>
      )}

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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-l-2 bg-muted/30 p-4">
        <Skeleton className="h-5 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <Skeleton className="h-[60vh] w-full rounded-2xl" />
    </div>
  );
}
