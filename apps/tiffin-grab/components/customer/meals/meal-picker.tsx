"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { CheckIcon, LockIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/components/customer/kit/cn";
import { Skeleton } from "@/components/customer/kit";
import { DishImage } from "@/components/customer/home/dish-image";
import { pickMyDish, applyMyDishToWeek } from "@/app/(customer)/me/meals/actions";
import type { GridCell, WeekDateView } from "@/lib/menu/meals-grid";

const DAY_SHORT: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const DAY_FULL: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
};

type Category = { key: string; label: string; selectable: boolean; sortOrder: number };
export type PickerWeekDate = Pick<WeekDateView, "dateIso" | "dayOfWeek" | "lockMs" | "locked" | "carriedBy" | "lockNote">;

type Trip = {
  key: string;
  deliveryDate: string;
  deliveryDay: string;
  lockMs: number | null;
  locked: boolean;
  days: string[];
};

function cellKey(cell: GridCell): string {
  return `${cell.dateIso}:${cell.slot}:${cell.personIndex}:${cell.pickIndex}`;
}

function dayNum(dateIso: string): string {
  return String(Number(dateIso.slice(8, 10)));
}

function lockText(lockMs: number, timezone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short", hour: "numeric", minute: "2-digit", timeZone: timezone,
  }).format(new Date(lockMs));
}

function buildTrips(days: string[], byDay: Map<string, GridCell[]>, weekDates: PickerWeekDate[] | undefined): Trip[] {
  const meta = new Map((weekDates ?? []).map((d) => [d.dateIso, d]));
  const trips = new Map<string, Trip>();
  for (const dateIso of days) {
    const cells = byDay.get(dateIso) ?? [];
    const m = meta.get(dateIso);
    const key = m?.carriedBy ?? dateIso;
    const t = trips.get(key) ?? {
      key,
      deliveryDate: key,
      deliveryDay: meta.get(key)?.dayOfWeek ?? (key === dateIso ? cells[0]?.day : undefined) ?? "",
      lockMs: m?.lockMs ?? null,
      locked: m?.locked ?? cells.every((c) => c.locked),
      days: [],
    };
    t.days.push(dateIso);
    trips.set(key, t);
  }
  return [...trips.values()];
}

function TripHeader({ trip, dayOf, timezone }: { trip: Trip; dayOf: (iso: string) => string; timezone?: string }) {
  const covers = trip.days.length > 1 ? ` · covers ${trip.days.map((d) => DAY_SHORT[dayOf(d)] ?? dayOf(d)).join(" + ")}` : "";
  const deliveredOn = DAY_SHORT[trip.deliveryDay] ?? trip.deliveryDay;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1">
      <p className="text-xs font-semibold tracking-tight">
        Delivered {deliveredOn}
        <span className="text-muted-foreground font-medium">{covers}</span>
      </p>
      <p className={cn("flex items-center gap-1 text-[11px] font-medium", trip.locked ? "text-muted-foreground" : "text-primary")}>
        {trip.locked ? (
          <>
            <LockIcon className="size-3" aria-hidden /> Locked
          </>
        ) : trip.lockMs != null ? (
          <span suppressHydrationWarning>Locks {lockText(trip.lockMs, timezone)}</span>
        ) : null}
      </p>
    </div>
  );
}

export function MealPickerSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-8">
      <div className="flex gap-2 overflow-hidden lg:flex-col">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-24 shrink-0 rounded-full lg:h-20 lg:w-full lg:rounded-2xl" />
        ))}
      </div>
      <div className="space-y-4 rounded-3xl border p-4 sm:p-6">
        <Skeleton className="h-7 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-7 w-32" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function MealPicker({
  grid,
  categories,
  orderPublicId,
  menuWeekId,
  weekDates,
  timezone,
  initialDate,
}: {
  grid: GridCell[];
  categories: Category[];
  orderPublicId: string;
  menuWeekId: string;
  weekDates?: PickerWeekDate[];
  timezone?: string;
  /** ?date= from the deliveries Pick sheet; ignored unless it is a day in this week. */
  initialDate?: string;
}) {
  const reduce = useReducedMotion();
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());
  const [applying, setApplying] = useState<Set<string>>(new Set());
  const [person, setPerson] = useState(1);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const byDay = new Map<string, GridCell[]>();
  for (const cell of grid) {
    const arr = byDay.get(cell.dateIso) ?? [];
    arr.push(cell);
    byDay.set(cell.dateIso, arr);
  }
  const days = [...byDay.keys()].sort();
  const [selectedDay, setSelectedDay] = useState(() => (initialDate && days.includes(initialDate) ? initialDate : (days[0] ?? "")));
  const activeDay = days.includes(selectedDay) ? selectedDay : (days[0] ?? "");
  const dayOf = (iso: string) => byDay.get(iso)?.[0]?.day ?? "";
  const trips = buildTrips(days, byDay, weekDates);
  const persons = Math.max(1, ...grid.map((c) => c.personIndex));
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

  const idx = days.indexOf(activeDay);
  const go = (delta: number) => {
    const next = days[idx + delta];
    if (next) setSelectedDay(next);
  };

  const dayCells = byDay.get(activeDay) ?? [];
  const dayOfWeek = dayCells[0]?.day ?? "";
  const dayLocked = dayCells.length > 0 && dayCells.every((c) => c.locked);
  const activeTrip = trips.find((t) => t.days.includes(activeDay));

  const summary = (dateIso: string) =>
    (byDay.get(dateIso) ?? [])
      .filter((c) => c.personIndex === 1)
      .map((c) => (c.dishes.find((d) => d.id === (overrides.get(cellKey(c)) ?? c.selectedDishId)) ?? c.dishes[0])?.name)
      .filter(Boolean)
      .join(", ");

  return (
    <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div
        role="tablist"
        aria-label="Choose a day"
        className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-5 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {trips.map((trip) => (
          <div key={trip.key} className="shrink-0 snap-start lg:shrink">
            <TripHeader trip={trip} dayOf={dayOf} timezone={timezone} />
            <div className="flex gap-2 lg:flex-col">
              {trip.days.map((dateIso) => {
                const cells = byDay.get(dateIso) ?? [];
                const locked = cells.length > 0 && cells.every((c) => c.locked);
                const active = dateIso === activeDay;
                const dow = cells[0]?.day ?? "";
                const sum = summary(dateIso);
                return (
                  <button
                    key={dateIso}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedDay(dateIso)}
                    className={cn(
                      "flex min-h-14 min-w-[4.5rem] flex-col items-center justify-center rounded-full border px-4 py-1.5 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.96] motion-reduce:active:scale-100",
                      "lg:min-h-[4.25rem] lg:w-full lg:py-2.5 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-2xl lg:px-4 lg:text-left",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-[0_10px_24px_-8px_var(--color-primary)]"
                        : "bg-card hover:border-primary/50",
                    )}
                  >
                    <span className="flex flex-col items-center leading-tight lg:items-start">
                      <span className="text-sm font-semibold">
                        {DAY_SHORT[dow] ?? dow}
                        {locked && <LockIcon className="ml-1 inline size-3" aria-label="Locked" />}
                      </span>
                      <span className={cn("text-xs tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        {dayNum(dateIso)}
                      </span>
                    </span>
                    {sum && (
                      <span className={cn("hidden min-w-0 flex-1 text-xs leading-snug lg:line-clamp-2", active ? "text-primary-foreground/85" : "text-muted-foreground")}>
                        {sum}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <motion.section
        key={activeDay}
        aria-label={`${DAY_FULL[dayOfWeek] ?? dayOfWeek} meals`}
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = t ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const t = e.changedTouches[0];
          const s = touch.current;
          touch.current = null;
          if (!t || !s) return;
          const dx = t.clientX - s.x;
          if (Math.abs(dx) > 60 && Math.abs(t.clientY - s.y) < 40) go(dx < 0 ? 1 : -1);
        }}
        className="bg-card touch-pan-y space-y-5 rounded-3xl border p-4 sm:p-6"
      >
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{DAY_FULL[dayOfWeek] ?? dayOfWeek}</h2>
            <p className="text-muted-foreground text-sm">
              {activeTrip && activeTrip.days.length > 1 && activeTrip.deliveryDate !== activeDay
                ? (dayCells[0]?.lockNote ?? "Delivered with an earlier trip")
                : activeTrip
                  ? `Delivered ${DAY_SHORT[activeTrip.deliveryDay] ?? ""}`.trim()
                  : ""}
            </p>
          </div>
          {dayLocked ? (
            <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
              <LockIcon className="size-3" aria-hidden />
              Locked
            </span>
          ) : activeTrip?.lockMs != null ? (
            <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold" suppressHydrationWarning>
              Change until {lockText(activeTrip.lockMs, timezone)}
            </span>
          ) : null}
        </header>

        {persons > 1 && (
          <div role="group" aria-label="Person" className="flex gap-2">
            {Array.from({ length: persons }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={person === p}
                onClick={() => setPerson(p)}
                className={cn(
                  "min-h-11 rounded-full border px-4 text-sm font-medium transition-transform active:scale-[0.96]",
                  person === p ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground",
                )}
              >
                Person {p}
              </button>
            ))}
          </div>
        )}

        {categoryOrder.map((cat) => {
          const catCells = dayCells.filter((c) => c.slot === cat.key && c.personIndex === Math.min(person, persons));
          if (catCells.length === 0) return null;
          const totalQty = cat.selectable ? catCells.length : (catCells[0]?.quantity ?? catCells.length);
          return (
            <div key={cat.key} className="space-y-4">
              {catCells.map((cell) => {
                const key = cellKey(cell);
                const selectedDishId = overrides.get(key) ?? cell.selectedDishId;
                const selectedDish = cell.dishes.find((d) => d.id === selectedDishId) ?? null;
                const label = cell.selectable && totalQty > 1 ? `${cat.label} ${cell.pickIndex} of ${totalQty}` : cat.label;

                if (!cell.selectable) {
                  const dish = selectedDish ?? cell.dishes[0];
                  if (!dish) return null;
                  return (
                    <div key={key} className="space-y-2">
                      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                        {cat.label}
                        {totalQty > 1 && <span className="bg-muted ml-2 rounded-full px-2 py-0.5 normal-case">x{totalQty}</span>}
                      </h3>
                      <div className="bg-muted/50 flex items-center gap-3 rounded-2xl border p-2">
                        <div className="relative size-14 shrink-0 overflow-hidden rounded-xl">
                          <DishImage image={dish.image} name={dish.name} category={cell.slot} sizes="56px" />
                        </div>
                        <span className="text-sm font-medium">{dish.name}</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</h3>
                      {!cell.locked && selectedDishId && (
                        <button
                          type="button"
                          disabled={applying.has(key)}
                          onClick={() => void handleApplyToWeek(cell, selectedDishId)}
                          className="text-primary min-h-11 rounded-full px-3 text-xs font-semibold disabled:opacity-50"
                        >
                          Apply to the whole week
                        </button>
                      )}
                    </div>
                    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                      {cell.dishes.map((dish) => {
                        const on = dish.id === selectedDishId;
                        return (
                          <button
                            key={dish.id}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={cell.locked}
                            onClick={() => !on && void handlePick(cell, dish.id)}
                            className={cn(
                              "group relative min-h-11 overflow-hidden rounded-2xl border text-left transition-[transform,border-color,box-shadow] duration-150 active:scale-[0.97] motion-reduce:active:scale-100",
                              on ? "border-primary ring-primary/40 ring-2" : "hover:border-primary/50",
                              cell.locked && "opacity-60",
                            )}
                          >
                            <div className="relative aspect-[4/3] w-full">
                              <DishImage image={dish.image} name={dish.name} category={cell.slot} sizes="(max-width: 640px) 45vw, 200px" />
                              {on && (
                                <span className="bg-primary text-primary-foreground absolute top-2 right-2 grid size-6 place-items-center rounded-full">
                                  <CheckIcon className="size-3.5" aria-hidden />
                                </span>
                              )}
                            </div>
                            <div className="p-2.5">
                              <p className="text-sm leading-snug font-medium">{dish.name}</p>
                              {on && cell.isDefaulted && overrides.get(key) == null && (
                                <p className="text-muted-foreground mt-0.5 text-[11px]">Default pick</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </motion.section>
    </div>
  );
}
