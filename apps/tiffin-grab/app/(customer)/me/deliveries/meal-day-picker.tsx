"use client";

// Interactive per-day meal picker for a pre-cutoff calendar cell — the calendar surface's
// lighter-weight sibling to components/customer/meals/meal-picker.tsx's full weekly grid.
// Supports multiple picks per category from the plan's categoryCounts (e.g. 2× Sabzi →
// "Sabzi 1" / "Sabzi 2"). Still single-person (personIndex 1); multi-person stays on /me/meals.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckIcon } from "lucide-react";
import { weekdayKey } from "@realm/commons";
import { cn } from "@realm/ui/cn";
import { DishImage } from "@/components/customer/home/dish-image";
import { pickMyDish, applyMyDishToWeek } from "../meals/actions";
import type { MealOption } from "@/lib/services/customer-deliveries.service";
import type { CalendarCell } from "./calendar-constants";

export function MealDayPicker({
  cell,
  orderPublicId,
  categoryLabels,
  categoryCounts = {},
  onChanged,
}: {
  cell: CalendarCell;
  orderPublicId: string;
  categoryLabels: Record<string, string>;
  categoryCounts?: Record<string, number>;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [activePick, setActivePick] = useState<Record<string, number>>({});
  const reduce = useReducedMotion();

  if (!cell.menuWeekId || cell.options.length === 0) return null;
  const menuWeekId = cell.menuWeekId;

  const byCategory = new Map<string, MealOption[]>();
  for (const o of cell.options) {
    const arr = byCategory.get(o.category) ?? [];
    arr.push(o);
    byCategory.set(o.category, arr);
  }

  // picks[i] is pickIndex i+1 for that category.
  const selectedByCategory = new Map<string, string[]>();
  if (cell.meal) {
    for (const c of cell.meal) {
      selectedByCategory.set(
        c.category,
        c.picks.map((p) => p.dishPublicId),
      );
    }
  }

  function qtyFor(category: string): number {
    const fromCounts = categoryCounts[category] ?? 0;
    if (fromCounts > 0) return fromCounts;
    return Math.max(1, selectedByCategory.get(category)?.length ?? 1);
  }

  function pickIndexFor(category: string): number {
    return activePick[category] ?? 1;
  }

  function pick(category: string, dishId: string) {
    const dayOfWeek = weekdayKey(new Date(`${cell.date}T00:00:00Z`));
    const pickIndex = pickIndexFor(category);
    startTransition(async () => {
      try {
        await pickMyDish({
          orderId: orderPublicId,
          menuWeekId,
          dayOfWeek,
          slot: category,
          personIndex: 1,
          pickIndex,
          dishId,
        });
        onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save that pick");
      }
    });
  }

  function applyToWeek(category: string, dishId: string) {
    const pickIndex = pickIndexFor(category);
    const key = `${category}:${pickIndex}:${dishId}`;
    setApplyingKey(key);
    startTransition(async () => {
      try {
        const res = await applyMyDishToWeek({
          orderId: orderPublicId,
          menuWeekId,
          slot: category,
          personIndex: 1,
          pickIndex,
          dishId,
        });
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
    <div className="space-y-4">
      {[...byCategory.entries()].map(([category, options]) => {
        const qty = qtyFor(category);
        const pickIndex = pickIndexFor(category);
        const selectedList = selectedByCategory.get(category) ?? [];
        const selected = selectedList[pickIndex - 1];
        const label = categoryLabels[category] ?? category;

        return (
          <div key={category} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs font-medium">
                {label}
                <span className="ml-1.5 tabular-nums text-foreground/70">{qty}×</span>
              </p>
              {qty > 1 ? (
                <div className="flex items-center gap-1" role="tablist" aria-label={`${label} item`}>
                  {Array.from({ length: qty }, (_, i) => {
                    const n = i + 1;
                    const active = pickIndex === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setActivePick((prev) => ({ ...prev, [category]: n }))}
                        className={cn(
                          "rounded-md px-2 py-1 text-[11px] font-medium tabular-nums transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Item {n}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {options.map((o) => {
                const isSelected = o.dishId === selected;
                return (
                  <motion.button
                    key={o.dishId}
                    type="button"
                    disabled={pending || isSelected}
                    onClick={() => pick(category, o.dishId)}
                    whileTap={reduce || isSelected ? undefined : { scale: 0.96 }}
                    transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                    className={cn(
                      "relative flex flex-col items-center gap-1 rounded-lg border p-1.5 text-left",
                      isSelected && "border-primary ring-primary/40 ring-2",
                      pending && "opacity-70",
                    )}
                  >
                    <div className="relative aspect-square w-full overflow-hidden rounded-md outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10">
                      <DishImage image={o.image} name={o.name} sizes="(max-width: 640px) 30vw, 120px" />
                    </div>
                    <span className="text-xs font-medium">{o.name}</span>
                    <AnimatePresence initial={false}>
                      {isSelected && (
                        <motion.span
                          initial={reduce ? undefined : { scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                          animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                          exit={reduce ? undefined : { scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                          transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                          className="absolute top-1 right-1"
                        >
                          <CheckIcon className="text-primary bg-background size-4 rounded-full" aria-hidden />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
            {selected && (
              <button
                type="button"
                disabled={pending || applyingKey === `${category}:${pickIndex}:${selected}`}
                onClick={() => applyToWeek(category, selected)}
                className="text-primary text-xs font-medium underline disabled:opacity-50"
              >
                Apply to whole week
                {qty > 1 ? ` (item ${pickIndex})` : ""}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
