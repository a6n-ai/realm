"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckIcon, LockIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";
import { Reveal, Pressable } from "@/components/motion";
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

  return (
    <Reveal.Group className="space-y-4">
      {days.map((dateIso) => {
        const dayCells = byDay.get(dateIso) ?? [];
        const dayOfWeek = dayCells[0]?.day ?? "";
        const locked = dayCells.every((c) => c.locked);
        return (
          <Reveal key={dateIso} className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{DAY_LABEL[dayOfWeek] ?? dayOfWeek}</h3>
              {locked && (
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
                return (
                  <div key={cat.key}>
                    <div className="text-muted-foreground mb-2 text-xs font-medium">{cat.label}</div>
                    <div className="space-y-3">
                      {catCells.map((cell) => {
                        const key = cellKey(cell);
                        const selectedDishId = overrides.get(key) ?? cell.selectedDishId;
                        const isApplying = applying.has(key);
                        if (!cell.selectable) {
                          const dish = cell.dishes[0];
                          if (!dish) return null;
                          return (
                            <div key={key} className="flex items-center gap-3 rounded-lg border p-2">
                              <div className="size-14 shrink-0 overflow-hidden rounded-md">
                                <DishImage image={dish.image} name={dish.name} />
                              </div>
                              {dish.image && <span className="text-sm font-medium">{dish.name}</span>}
                            </div>
                          );
                        }
                        return (
                          <div key={key}>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {cell.dishes.map((o) => {
                                const isSelected = o.id === selectedDishId;
                                const disabled = cell.locked;
                                return (
                                  <Pressable
                                    key={o.id}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => {
                                      if (disabled || isSelected) return;
                                      void handlePick(cell, o.id);
                                    }}
                                    className={cn(
                                      "relative flex flex-col items-center gap-1 rounded-lg border p-2 text-left",
                                      isSelected && "border-primary ring-primary/40 ring-2",
                                      disabled && "opacity-60",
                                    )}
                                  >
                                    <div className="aspect-square w-full overflow-hidden rounded-md">
                                      <DishImage image={o.image} name={o.name} />
                                    </div>
                                    {/* DishImage already renders the name as a fallback tile when there's no photo;
                                        only add a separate label when there IS a photo, to avoid duplicate text. */}
                                    {o.image && <span className="text-xs font-medium">{o.name}</span>}
                                    {isSelected && (
                                      <CheckIcon className="text-primary bg-background absolute top-1 right-1 size-4 rounded-full" aria-hidden />
                                    )}
                                  </Pressable>
                                );
                              })}
                            </div>
                            {!cell.locked && selectedDishId && (
                              <button
                                type="button"
                                disabled={isApplying}
                                onClick={() => void handleApplyToWeek(cell, selectedDishId)}
                                className="text-primary mt-1 text-xs font-medium underline disabled:opacity-50"
                              >
                                Apply to the whole week
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>
        );
      })}
    </Reveal.Group>
  );
}
