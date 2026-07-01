"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WeeklyMenuPoster } from "@/components/marketing/weekly-menu-poster";
import { DAY_COLUMNS, dietDotClass, type DayOfWeek, type PosterItem } from "@/lib/menu/poster";
import type { MealSlot, MealTypeConfig, PlanType } from "@/lib/menu/meal-types";
import { WeekStartPicker } from "./week-start-picker";
import { addItem, createDish, releaseWeek, removeItem, upsertWeek } from "./actions";

const CREATE_VALUE = "__create__";

type Dish = { id: string; name: string; diet: "veg" | "nonveg" };
type Week = { id: string; weekStart: string; status: string };
type Item = { id: string; dayOfWeek: string; slot: string; dishId: string; position: number };

export function MenuBuilder({
  planType, mealType, dishes, week, items, takenWeekStarts,
}: { planType: PlanType; mealType: MealTypeConfig & { slots: MealSlot[] }; dishes: Dish[]; week: Week | null; items: Item[]; takenWeekStarts: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(week?.weekStart ?? "");
  const [createTarget, setCreateTarget] = useState<{ storeDay: DayOfWeek; slot: string; position: number } | null>(null);
  const [newName, setNewName] = useState("");
  const [newDiet, setNewDiet] = useState<"veg" | "nonveg">("veg");

  const run = (fn: () => Promise<void>) => start(async () => {
    setError(null);
    try { await fn(); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
  });

  const dishById = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const posterItems: PosterItem[] = items.flatMap((i) => {
    const d = dishById.get(i.dishId);
    return d ? [{ dayOfWeek: i.dayOfWeek as DayOfWeek, slot: i.slot, dishName: d.name, diet: d.diet, position: i.position }] : [];
  });

  const handleUpsert = () => {
    if (!weekStart) return;
    run(async () => {
      const w = await upsertWeek({ planType, weekStart });
      router.push(`/dashboard/menus?type=${planType}&week=${w.publicId}`);
    });
  };

  const closeToList = () => router.push(`/dashboard/menus?type=${planType}`);

  const handleCreateDish = () => {
    const t = createTarget;
    if (!t || !week || !newName.trim()) return;
    run(async () => {
      const d = await createDish({ name: newName, diet: newDiet });
      await addItem({ menuWeekId: week.id, dayOfWeek: t.storeDay, slot: t.slot, dishId: d.publicId, position: t.position });
      setCreateTarget(null);
      setNewName("");
      setNewDiet("veg");
    });
  };

  const cellItems = (days: DayOfWeek[], slot: string) =>
    items.filter((i) => days.includes(i.dayOfWeek as DayOfWeek) && i.slot === slot)
      .sort((a, b) => days.indexOf(a.dayOfWeek as DayOfWeek) - days.indexOf(b.dayOfWeek as DayOfWeek) || a.position - b.position);

  return (
    <div className="space-y-6">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="flex flex-wrap items-end gap-4 rounded-xl border p-5 shadow-sm">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Plan type</label>
          <Select value={planType} onValueChange={(t) => router.push(`/dashboard/menus?type=${t}`)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tiffin">Tiffin</SelectItem>
              <SelectItem value="healthy">Healthy</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Week start (Monday)</label>
          <WeekStartPicker value={weekStart} onChange={setWeekStart} disabledDates={takenWeekStarts} />
        </div>
        {!week && (
          <Button className="transition-transform active:scale-[0.96]" onClick={handleUpsert} disabled={pending || !weekStart}>
            Create draft
          </Button>
        )}
      </div>

      {week && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-sm">
            {week.status === "draft" ? (
              <>
                <CheckCircle2 className="size-4 text-ok" />
                <span className="font-medium">Draft saved automatically</span>
                <span className="text-muted-foreground">— every dish you add or remove is saved.</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4 text-ok" />
                <span className="font-medium text-ok">Released</span>
                <span className="text-muted-foreground">— live on the website.</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {week.status === "draft" && (
              <Button variant="default" className="transition-transform active:scale-[0.96]" disabled={pending} onClick={() => run(() => releaseWeek(week.id))}>
                Release menu
              </Button>
            )}
            <Button variant="outline" className="transition-transform active:scale-[0.96]" onClick={closeToList}>
              {week.status === "draft" ? "Save & close" : "Close"}
            </Button>
          </div>
        </div>
      )}


      {week && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {DAY_COLUMNS.map((col) => {
              const storeDay = col.days[0]; // weekend dishes stored under sat
              const dayCount = mealType.slots.reduce((n, s) => n + cellItems(col.days, s.key).length, 0);
              return (
                <div key={col.label} className="rounded-xl border p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-semibold">{col.label}</h4>
                    <span className="text-xs text-muted-foreground tabular-nums">{dayCount} dishes</span>
                  </div>
                  <div className="space-y-3">
                    {mealType.slots.map((slot) => {
                      const ci = cellItems(col.days, slot.key);
                      const addable = dishes.filter((d) => !ci.some((i) => i.dishId === d.id));
                      return (
                        <div key={slot.key} className="space-y-1.5">
                          {mealType.slots.length > 1 && <p className="text-xs font-medium text-muted-foreground">{slot.label}</p>}
                          {ci.map((i) => {
                            const d = dishById.get(i.dishId);
                            return (
                              <div key={i.id} className="group flex items-center gap-2 rounded-lg bg-muted/40 py-1.5 pl-2.5 pr-1 text-sm">
                                <span aria-hidden className={`size-2 shrink-0 rounded-full ${dietDotClass(d?.diet ?? "nonveg", d?.name ?? "")}`} />
                                <span className="flex-1 text-pretty">{d?.name ?? i.dishId}</span>
                                {week.status === "draft" && (
                                  <button
                                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-[0.96] disabled:opacity-50"
                                    disabled={pending}
                                    aria-label={`Remove ${d?.name ?? "dish"}`}
                                    onClick={() => run(() => removeItem(i.id))}
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {week.status === "draft" && (
                            <Select
                              value=""
                              onValueChange={(v) => {
                                if (v === CREATE_VALUE) {
                                  setNewName("");
                                  setNewDiet("veg");
                                  setCreateTarget({ storeDay, slot: slot.key, position: ci.length });
                                  return;
                                }
                                run(() => addItem({ menuWeekId: week.id, dayOfWeek: storeDay, slot: slot.key, dishId: v, position: ci.length }).then(() => {}));
                              }}
                            >
                              <SelectTrigger className="h-9 rounded-lg text-xs text-muted-foreground"><SelectValue placeholder="+ add dish" /></SelectTrigger>
                              <SelectContent>
                                {addable.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                                <SelectItem value={CREATE_VALUE} className="text-primary">+ Create new dish…</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="lg:sticky lg:top-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Live preview</p>
            <WeeklyMenuPoster titlePrefix={mealType.titlePrefix} weekStart={weekStart || week.weekStart} slots={mealType.slots} items={posterItems} accent={mealType.accent} />
          </div>
        </div>
      )}

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
            <Select value={newDiet} onValueChange={(d) => setNewDiet(d as "veg" | "nonveg")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="veg">Veg</SelectItem>
                <SelectItem value="nonveg">Non-veg</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Tip: include &quot;Egg&quot; in the name for a yellow indicator.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateTarget(null)} disabled={pending}>Cancel</Button>
            <Button onClick={handleCreateDish} disabled={pending || !newName.trim()} className="transition-transform active:scale-[0.96]">Create &amp; add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
