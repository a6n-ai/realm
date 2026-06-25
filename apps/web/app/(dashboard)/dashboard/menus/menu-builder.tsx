"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WeeklyMenuPoster } from "@/components/marketing/weekly-menu-poster";
import { DAY_COLUMNS, type DayOfWeek, type PosterItem } from "@/lib/menu/poster";
import type { MealTypeConfig, PlanType } from "@/lib/menu/meal-types";
import { addItem, releaseWeek, removeItem, upsertWeek } from "./actions";

type Dish = { id: string; name: string; diet: "veg" | "nonveg" };
type Week = { id: string; weekStart: string; status: string; orderCutoff: string };
type Item = { id: string; dayOfWeek: string; slot: string; dishId: string; position: number };

export function MenuBuilder({
  planType, mealType, dishes, week, items,
}: { planType: PlanType; mealType: MealTypeConfig; dishes: Dish[]; week: Week | null; items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(week?.weekStart ?? "");
  const [orderCutoff, setOrderCutoff] = useState(week?.orderCutoff ? new Date(week.orderCutoff).toISOString().slice(0, 16) : "");

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
    if (!weekStart || !orderCutoff) return;
    run(async () => {
      const w = await upsertWeek({ planType, weekStart, orderCutoff: new Date(orderCutoff).toISOString() });
      router.push(`/dashboard/menus?type=${planType}&week=${w.publicId}`);
    });
  };

  const cellItems = (days: DayOfWeek[], slot: string) =>
    items.filter((i) => days.includes(i.dayOfWeek as DayOfWeek) && i.slot === slot)
      .sort((a, b) => days.indexOf(a.dayOfWeek as DayOfWeek) - days.indexOf(b.dayOfWeek as DayOfWeek) || a.position - b.position);

  return (
    <div className="space-y-6">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Plan type</label>
          <Select value={planType} onValueChange={(t) => router.push(`/dashboard/menus?type=${t}`)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tiffin">Tiffin</SelectItem>
              <SelectItem value="healthy">Healthy</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Week start (Monday)</label>
          <input type="date" className="rounded-md border px-3 py-2 text-sm" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Order cutoff</label>
          <input type="datetime-local" className="rounded-md border px-3 py-2 text-sm" value={orderCutoff} onChange={(e) => setOrderCutoff(e.target.value)} />
        </div>
        <Button onClick={handleUpsert} disabled={pending || !weekStart || !orderCutoff}>{week ? "Update week" : "Create week"}</Button>
        {week && week.status === "draft" && <Button variant="destructive" disabled={pending} onClick={() => run(() => releaseWeek(week.id))}>Release</Button>}
        {week && week.status === "released" && <span className="text-sm text-muted-foreground">Released</span>}
      </div>

      {week && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {DAY_COLUMNS.map((col) => {
              const storeDay = col.days[0]; // weekend dishes stored under sat
              return (
                <div key={col.label} className="rounded-lg border p-3">
                  <h4 className="mb-2 text-sm font-semibold">{col.label}</h4>
                  {mealType.slots.map((slot) => {
                    const ci = cellItems(col.days, slot.key);
                    const addable = dishes.filter((d) => !ci.some((i) => i.dishId === d.id));
                    return (
                      <div key={slot.key} className="mb-2">
                        {mealType.slots.length > 1 && <p className="text-xs text-muted-foreground">{slot.label}</p>}
                        <div className="space-y-1">
                          {ci.map((i) => {
                            const d = dishById.get(i.dishId);
                            return (
                              <div key={i.id} className="flex items-center gap-2 text-sm">
                                <span className={`size-2 rounded-full ${d?.diet === "veg" ? "bg-green-600" : "bg-red-600"}`} />
                                <span className="flex-1">{d?.name ?? i.dishId}</span>
                                {week.status === "draft" && <button className="text-xs text-destructive" disabled={pending} onClick={() => run(() => removeItem(i.id))}>✕</button>}
                              </div>
                            );
                          })}
                          {week.status === "draft" && addable.length > 0 && (
                            <Select onValueChange={(dishId) => run(() => addItem({ menuWeekId: week.id, dayOfWeek: storeDay, slot: slot.key, dishId, position: ci.length }).then(() => {}))}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="+ add dish" /></SelectTrigger>
                              <SelectContent>{addable.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
    </div>
  );
}
