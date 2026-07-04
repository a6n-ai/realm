"use client";

import { useState, useTransition } from "react";
import { CalendarCheckIcon, ChevronDownIcon, LockIcon } from "lucide-react";
import { formatDeliveryTime } from "@/lib/format/datetime";
import { cn } from "@realm/ui/cn";
import { Skeleton } from "@realm/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@realm/ui/sheet";
import { pickDish, applyDishToWeek } from "./actions";
import type { GridCell } from "@/lib/menu/meals-grid";

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

type SlotMeta = { key: string; label: string; sortOrder: number };
type WeekDate = {
  dateIso: string;
  dayOfWeek: DayOfWeek;
  weekStartIso: string;
  lockMs: number;
  locked: boolean;
};

type Props = {
  orderId: string;
  menuWeekId: string;
  grid: GridCell[];
  persons: number;
  weekDates: WeekDate[];
  enabledSlots: SlotMeta[];
  timezone: string;
};

// Single source of truth for the card-grid layout. The real grid and the
// skeleton twin both render from this, so the loading state can never drift.
const GRID_CLASS = "grid grid-cols-1 gap-3 pb-6 md:grid-cols-2 xl:grid-cols-3";
const CARD_CLASS = "overflow-hidden rounded-xl border bg-card shadow-sm";

export function MealsGrid({
  orderId,
  menuWeekId,
  grid,
  persons,
  weekDates,
  enabledSlots,
  timezone,
}: Props) {
  return (
    <div className={GRID_CLASS}>
      {weekDates.map((weekDate) => (
        <DeliveryCard
          key={weekDate.dateIso}
          weekDate={weekDate}
          enabledSlots={enabledSlots}
          persons={persons}
          grid={grid}
          orderId={orderId}
          menuWeekId={menuWeekId}
          timezone={timezone}
        />
      ))}
    </div>
  );
}

// Exact loading twin: same GRID_CLASS wrapper and the same DeliveryCard shape
// (header with day/lock lines + divided slot sections), grey blocks instead of
// data. Rendered as the page's <Suspense fallback>.
export function MealsGridSkeleton() {
  return (
    <div className={GRID_CLASS}>
      {Array.from({ length: 6 }).map((_, i) => (
        <article key={i} className={CARD_CLASS}>
          <div className="flex items-start justify-between border-b px-4 py-3">
            <div className="space-y-0.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
          <div className="divide-y">
            {Array.from({ length: 2 }).map((_, s) => (
              <div key={s} className="space-y-2 px-4 py-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-11 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
};

function DeliveryCard({
  weekDate,
  enabledSlots,
  persons,
  grid,
  orderId,
  menuWeekId,
  timezone,
}: {
  weekDate: WeekDate;
  enabledSlots: SlotMeta[];
  persons: number;
  grid: GridCell[];
  orderId: string;
  menuWeekId: string;
  timezone: string;
}) {
  const { dateIso, dayOfWeek, lockMs, locked } = weekDate;

  return (
    <article
      className={cn(CARD_CLASS, locked && "opacity-70")}
    >
      {/* Card header */}
      <div className="flex items-start justify-between border-b px-4 py-3">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold" style={{ textWrap: "balance" } as React.CSSProperties}>
            {DAY_LABELS[dayOfWeek]} · {dateIso}
          </p>
          <p className="tabular-nums text-xs text-muted-foreground">
            {locked
              ? "Locked"
              : `Edit until ${formatDeliveryTime(lockMs, timezone)}`}
          </p>
        </div>
        {locked && (
          <LockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </div>

      {/* Slot sections */}
      <div className="divide-y">
        {enabledSlots.map((slot) => {
          const rows = Array.from({ length: persons }, (_, i) => {
            const personIndex = i + 1;
            const cell = grid.find(
              (c) =>
                c.dateIso === dateIso &&
                c.slot === slot.key &&
                c.personIndex === personIndex,
            );
            return { personIndex, cell };
          });

          if (!rows.some((r) => r.cell)) return null;

          return (
            <div key={slot.key} className="space-y-2 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {slot.label}
              </p>
              {rows.map(({ personIndex, cell }) => {
                if (!cell) {
                  return (
                    <div
                      key={personIndex}
                      className="flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground"
                    >
                      {persons > 1 && (
                        <span className="w-6 text-xs font-medium">
                          P{personIndex}
                        </span>
                      )}
                      <span>—</span>
                    </div>
                  );
                }
                return (
                  <DishRow
                    key={`${dateIso}-${slot.key}-${personIndex}`}
                    cell={cell}
                    slotLabel={slot.label}
                    orderId={orderId}
                    menuWeekId={menuWeekId}
                    showPersonLabel={persons > 1}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </article>
  );
}

type SheetMode = "pick" | "apply";

function DishRow({
  cell,
  slotLabel,
  orderId,
  menuWeekId,
  showPersonLabel,
}: {
  cell: GridCell;
  slotLabel: string;
  orderId: string;
  menuWeekId: string;
  showPersonLabel: boolean;
}) {
  const [sheetMode, setSheetMode] = useState<SheetMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tally, setTally] = useState<{ applied: number; skipped: number } | null>(null);
  const [isPending, start] = useTransition();

  const selectedDish = cell.dishes.find((d) => d.id === cell.selectedDishId);

  function handlePickDish(dishId: string) {
    setSheetMode(null);
    setError(null);
    setTally(null);
    start(async () => {
      try {
        await pickDish({
          orderId,
          menuWeekId,
          dayOfWeek: cell.day,
          slot: cell.slot,
          personIndex: cell.personIndex,
          dishId,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save selection");
      }
    });
  }

  function handleApplyToWeek(dishId: string) {
    setSheetMode(null);
    setError(null);
    setTally(null);
    start(async () => {
      try {
        const result = await applyDishToWeek({
          orderId,
          menuWeekId,
          slot: cell.slot,
          personIndex: cell.personIndex,
          dishId,
        });
        setTally({ applied: result.applied, skipped: result.skipped.length });
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to apply to week",
        );
      }
    });
  }

  /* Locked cells: read-only text, no tap target */
  if (cell.locked) {
    return (
      <div className="flex min-h-[44px] items-center gap-2 text-sm">
        {showPersonLabel && (
          <span className="w-6 text-xs font-medium text-muted-foreground">
            P{cell.personIndex}
          </span>
        )}
        <span className={cn(cell.isDefaulted && "text-muted-foreground")}>
          {selectedDish?.name ?? "—"}
        </span>
        {cell.isDefaulted && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
            Default
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {showPersonLabel && (
          <span className="w-6 shrink-0 text-xs font-medium text-muted-foreground">
            P{cell.personIndex}
          </span>
        )}

        {/* Main dish button — ≥44px touch target */}
        <button
          disabled={isPending}
          onClick={() => setSheetMode("pick")}
          className="flex min-h-[44px] flex-1 items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 text-left transition-[background-color,transform] hover:bg-muted active:scale-[0.96] disabled:opacity-50"
        >
          <span className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn("text-sm", cell.isDefaulted && "text-muted-foreground")}
            >
              {selectedDish?.name ?? "—"}
            </span>
            {cell.isDefaulted && (
              <span className="rounded-full border bg-background px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                Default
              </span>
            )}
          </span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        {/* Apply to whole week — 44×44px touch target */}
        <button
          disabled={isPending}
          onClick={() => setSheetMode("apply")}
          title="Apply to whole week"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,transform] hover:bg-muted hover:text-foreground active:scale-[0.96] disabled:opacity-50"
        >
          <CalendarCheckIcon className="h-4 w-4" />
          <span className="sr-only">Apply to whole week</span>
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {tally && (
        <p className="tabular-nums text-xs text-muted-foreground">
          Applied to {tally.applied} day{tally.applied !== 1 ? "s" : ""}
          {tally.skipped > 0 && ` · ${tally.skipped} skipped`}
        </p>
      )}

      {/* Bottom sheet — shared for pick and apply-to-week */}
      <Sheet
        open={sheetMode !== null}
        onOpenChange={(open) => {
          if (!open) setSheetMode(null);
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-hidden rounded-t-2xl pb-6"
        >
          <SheetHeader>
            <SheetTitle>
              {sheetMode === "apply" ? "Apply to whole week" : `Choose ${slotLabel}`}
            </SheetTitle>
            {sheetMode === "apply" && (
              <SheetDescription>
                Sets this dish for all unlocked days this week.
              </SheetDescription>
            )}
          </SheetHeader>
          <DishList
            dishes={cell.dishes}
            onSelect={sheetMode === "apply" ? handleApplyToWeek : handlePickDish}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DishList({
  dishes,
  onSelect,
}: {
  dishes: { id: string; name: string; diet: "veg" | "nonveg" }[];
  onSelect: (dishId: string) => void;
}) {
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto divide-y">
      {dishes.map((dish) => (
        <li key={dish.id}>
          <button
            onClick={() => onSelect(dish.id)}
            className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left transition-[background-color,transform] hover:bg-muted active:scale-[0.96]"
          >
            <span className="text-sm font-medium">{dish.name}</span>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {dish.diet === "veg" ? "V" : "NV"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
