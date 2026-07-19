"use client";

// Interactive per-day meal picker for a pre-cutoff calendar cell — the calendar surface's
// lighter-weight sibling to components/customer/meals/meal-picker.tsx's full weekly grid.
// Deliberately single-pick-per-category (personIndex 1, pickIndex 1): the calendar's day-tap
// flow is a quick "change today's meal" action, not the multi-person/multi-pick editor that
// page already covers on /me/meals.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckIcon } from "lucide-react";
import { weekdayKey } from "@realm/commons";
import { cn } from "@realm/ui/cn";
import { DishImage } from "@/components/customer/home/dish-image";
import { pickMyDish, applyMyDishToWeek } from "../meals/actions";
import type { MealOption } from "@/lib/services/customer-deliveries.service";
import type { CalendarCell } from "./calendar-constants";

export function MealDayPicker({ cell, orderPublicId, categoryLabels, onChanged }: {
  cell: CalendarCell;
  orderPublicId: string;
  categoryLabels: Record<string, string>;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [applyingKey, setApplyingKey] = useState<string | null>(null);

  if (!cell.menuWeekId || cell.options.length === 0) return null;
  const menuWeekId = cell.menuWeekId;

  const byCategory = new Map<string, MealOption[]>();
  for (const o of cell.options) {
    const arr = byCategory.get(o.category) ?? [];
    arr.push(o);
    byCategory.set(o.category, arr);
  }

  // The resolved meal's first pick per category stands in for "currently selected" — this
  // picker only ever writes pickIndex 1, so that's the only pick that can be showing here.
  const selectedByCategory = new Map<string, string>();
  if (cell.meal) {
    for (const c of cell.meal) {
      const first = c.picks[0];
      if (first) selectedByCategory.set(c.category, first.dishPublicId);
    }
  }

  function pick(category: string, dishId: string) {
    const dayOfWeek = weekdayKey(new Date(`${cell.date}T00:00:00Z`));
    startTransition(async () => {
      try {
        await pickMyDish({ orderId: orderPublicId, menuWeekId, dayOfWeek, slot: category, personIndex: 1, pickIndex: 1, dishId });
        onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save that pick");
      }
    });
  }

  function applyToWeek(category: string, dishId: string) {
    const key = `${category}:${dishId}`;
    setApplyingKey(key);
    startTransition(async () => {
      try {
        const res = await applyMyDishToWeek({ orderId: orderPublicId, menuWeekId, slot: category, personIndex: 1, pickIndex: 1, dishId });
        onChanged();
        toast.success(`Applied to ${res.applied} day${res.applied === 1 ? "" : "s"}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't apply to the week");
      } finally {
        setApplyingKey(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {[...byCategory.entries()].map(([category, options]) => {
        const selected = selectedByCategory.get(category);
        return (
          <div key={category}>
            <p className="text-muted-foreground mb-1.5 text-xs font-medium">{categoryLabels[category] ?? category}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {options.map((o) => {
                const isSelected = o.dishId === selected;
                return (
                  <button
                    key={o.dishId}
                    type="button"
                    disabled={pending || isSelected}
                    onClick={() => pick(category, o.dishId)}
                    className={cn(
                      "relative flex flex-col items-center gap-1 rounded-lg border p-1.5 text-left",
                      isSelected && "border-primary ring-primary/40 ring-2",
                      pending && "opacity-70",
                    )}
                  >
                    <div className="relative aspect-square w-full overflow-hidden rounded-md">
                      <DishImage image={o.image} name={o.name} sizes="(max-width: 640px) 30vw, 120px" />
                    </div>
                    {o.image && <span className="text-xs font-medium">{o.name}</span>}
                    {isSelected && (
                      <CheckIcon className="text-primary bg-background absolute top-1 right-1 size-4 rounded-full" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
            {selected && (
              <button
                type="button"
                disabled={pending || applyingKey === `${category}:${selected}`}
                onClick={() => applyToWeek(category, selected)}
                className="text-primary mt-1 text-xs font-medium underline disabled:opacity-50"
              >
                Apply to whole week
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
