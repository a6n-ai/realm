"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LockIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@realm/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import { Badge } from "@realm/ui/badge";
import { Reveal } from "@/components/motion";
import { DishImage } from "@/components/customer/home/dish-image";
import { pickMyDish, applyMyDishToWeek } from "@/app/(customer)/me/meals/actions";
import type { GridCell } from "@/lib/menu/meals-grid";

const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

type Category = { key: string; label: string; selectable: boolean; sortOrder: number };

function cellKey(cell: GridCell): string {
  return `${cell.dateIso}:${cell.slot}:${cell.personIndex}:${cell.pickIndex}`;
}

export function MealPickerSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-muted/40 h-32 animate-pulse rounded-lg" />
      ))}
    </div>
  );
}

export function MealPicker({
  grid,
  categories,
  orderPublicId,
  menuWeekId,
}: {
  grid: GridCell[];
  categories: Category[];
  orderPublicId: string;
  menuWeekId: string;
}) {
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());
  const [applying, setApplying] = useState<Set<string>>(new Set());

  const byDay = new Map<string, GridCell[]>();
  for (const cell of grid) {
    const arr = byDay.get(cell.dateIso) ?? [];
    arr.push(cell);
    byDay.set(cell.dateIso, arr);
  }
  const days = [...byDay.keys()].sort();
  // Lazy initialiser: pick the first day once, not on every render — switching
  // days is driven entirely by the Tabs' own value/onValueChange below.
  const [selectedDay, setSelectedDay] = useState(() => days[0] ?? "");
  const activeDay = days.includes(selectedDay) ? selectedDay : (days[0] ?? "");

  const categoryOrder = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  async function handlePick(cell: GridCell, dishId: string) {
    const key = cellKey(cell);
    const prev = overrides.get(key);
    setOverrides((m) => new Map(m).set(key, dishId));
    try {
      await pickMyDish({
        orderId: orderPublicId,
        menuWeekId,
        dayOfWeek: cell.day,
        slot: cell.slot,
        personIndex: cell.personIndex,
        pickIndex: cell.pickIndex,
        dishId,
      });
    } catch (err) {
      setOverrides((m) => {
        const next = new Map(m);
        if (prev == null) next.delete(key);
        else next.set(key, prev);
        return next;
      });
      toast.error(err instanceof Error ? err.message : "Couldn't save that pick");
    }
  }

  async function handleApplyToWeek(cell: GridCell, dishId: string) {
    const key = cellKey(cell);
    setApplying((s) => new Set(s).add(key));
    try {
      await applyMyDishToWeek({
        orderId: orderPublicId,
        menuWeekId,
        slot: cell.slot,
        personIndex: cell.personIndex,
        pickIndex: cell.pickIndex,
        dishId,
      });
      toast.success("Applied to the rest of the week");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't apply to the week");
    } finally {
      setApplying((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  }

  if (days.length === 0) return null;

  const dayCells = byDay.get(activeDay) ?? [];
  const dayOfWeek = dayCells[0]?.day ?? "";
  const dayLocked = dayCells.length > 0 && dayCells.every((c) => c.locked);

  return (
    <div className="space-y-4">
      <Tabs value={activeDay} onValueChange={setSelectedDay}>
        <TabsList aria-label="Choose a day" className="w-full">
          {days.map((dateIso) => {
            const cellsForDay = byDay.get(dateIso) ?? [];
            const locked = cellsForDay.length > 0 && cellsForDay.every((c) => c.locked);
            const label = DAY_LABEL[cellsForDay[0]?.day ?? ""] ?? cellsForDay[0]?.day ?? "";
            return (
              <TabsTrigger key={dateIso} value={dateIso}>
                {label}
                {locked && <LockIcon aria-hidden />}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <Reveal key={activeDay} className="rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{DAY_LABEL[dayOfWeek] ?? dayOfWeek}</h3>
          {dayLocked && (
            <span className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
              <LockIcon className="size-3" aria-hidden />
              Locked
            </span>
          )}
        </div>
        <div className="space-y-4">
          {categoryOrder.map((cat) => {
            const catCells = dayCells.filter((c) => c.slot === cat.key);
            if (catCells.length === 0) return null;
            // Selectable categories carry one cell per unit (pickIndex); fixed
            // categories carry their whole count on the one cell's `quantity`.
            const totalQty = cat.selectable ? catCells.length : (catCells[0]?.quantity ?? catCells.length);
            return (
              <div key={cat.key}>
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs font-medium">{cat.label}</span>
                  {totalQty > 1 && (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                      ×{totalQty}
                    </Badge>
                  )}
                </div>
                <div className="space-y-2">
                  {catCells.map((cell) => {
                    const key = cellKey(cell);
                    const selectedDishId = overrides.get(key) ?? cell.selectedDishId;
                    const isApplying = applying.has(key);
                    const selectedDish = cell.dishes.find((d) => d.id === selectedDishId) ?? cell.dishes[0];

                    if (!cell.selectable) {
                      if (!selectedDish) return null;
                      return (
                        <div key={key} className="flex items-center gap-3 rounded-lg border p-2">
                          <div className="relative size-12 shrink-0 overflow-hidden rounded-md">
                            <DishImage image={selectedDish.image} name={selectedDish.name} category={cell.slot} sizes="48px" />
                          </div>
                          <span className="text-sm font-medium">{selectedDish.name}</span>
                        </div>
                      );
                    }

                    return (
                      <div key={key} className="flex items-center gap-3 rounded-lg border p-2">
                        <div className="relative size-12 shrink-0 overflow-hidden rounded-md">
                          {selectedDish && (
                            <DishImage image={selectedDish.image} name={selectedDish.name} category={cell.slot} sizes="48px" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <Select
                            value={selectedDishId ?? undefined}
                            onValueChange={(dishId) => void handlePick(cell, dishId)}
                            disabled={cell.locked}
                          >
                            <SelectTrigger className="w-full" size="sm">
                              <SelectValue placeholder="Choose a dish" />
                            </SelectTrigger>
                            <SelectContent>
                              {cell.dishes.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!cell.locked && selectedDishId && (
                            <button
                              type="button"
                              disabled={isApplying}
                              onClick={() => void handleApplyToWeek(cell, selectedDishId)}
                              className="text-primary text-xs font-medium underline disabled:opacity-50"
                            >
                              Apply to the whole week
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>
    </div>
  );
}
