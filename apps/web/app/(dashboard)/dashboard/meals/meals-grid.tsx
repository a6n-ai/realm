"use client";

import { useState, useTransition } from "react";
import { cutoffMsFor } from "@tiffin/commons";
import { formatDeliveryTime } from "@/lib/format/datetime";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pickDish } from "./actions";
import type { GridCell } from "./page";

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAY_LABELS: Record<DayOfWeek, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
type SlotMeta = { key: string; label: string; sortOrder: number };
type WeekDate = { dateIso: string; dayOfWeek: DayOfWeek; weekStartIso: string };

type Props = {
  orderId: string;
  menuWeekId: string;
  grid: GridCell[];
  persons: number;
  weekDates: WeekDate[];
  enabledSlots: SlotMeta[];
  timezone: string;
  cutoffHour: number;
};

export function MealsGrid({ orderId, menuWeekId, grid, persons, weekDates, enabledSlots, timezone, cutoffHour }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border p-2 text-left">Delivery</th>
            {enabledSlots.map((s) =>
              Array.from({ length: persons }, (_, i) => (
                <th key={`${s.key}-${i}`} className="border p-2 text-left">
                  {s.label}
                  {persons > 1 && <span className="ml-1 text-xs font-normal text-muted-foreground">P{i + 1}</span>}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {weekDates.map(({ dateIso, dayOfWeek }) => {
            const lockMs = cutoffMsFor(dateIso, cutoffHour, timezone);
            const locked = Date.now() > lockMs;
            return (
              <tr key={dateIso}>
                <td className="border p-2 font-medium">
                  <div>{DAY_LABELS[dayOfWeek]} {dateIso}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {locked ? "Locked" : `Edit until ${formatDeliveryTime(lockMs, timezone)}`}
                  </div>
                </td>
                {enabledSlots.map((slot) =>
                  Array.from({ length: persons }, (_, i) => {
                    const personIndex = i + 1;
                    const cell = grid.find(
                      (c) => c.dateIso === dateIso && c.slot === slot.key && c.personIndex === personIndex
                    );
                    if (!cell) {
                      return (
                        <td key={`${slot.key}-${personIndex}`} className="border p-2 text-xs text-muted-foreground">
                          —
                        </td>
                      );
                    }
                    return (
                      <CellSelect
                        key={`${dateIso}-${slot.key}-${personIndex}`}
                        cell={cell}
                        orderId={orderId}
                        menuWeekId={menuWeekId}
                      />
                    );
                  })
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CellSelect({
  cell,
  orderId,
  menuWeekId,
}: {
  cell: GridCell;
  orderId: string;
  menuWeekId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function handleChange(dishId: string) {
    setError(null);
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

  return (
    <td className="border p-2 align-top">
      <div className="space-y-1">
        {cell.locked ? (
          <span className="text-sm">
            {cell.dishes.find((d) => d.id === cell.selectedDishId)?.name ?? "—"}
          </span>
        ) : (
          <Select value={cell.selectedDishId ?? undefined} onValueChange={handleChange}>
            <SelectTrigger className="h-8 min-w-[140px] text-xs">
              <SelectValue placeholder="Choose dish" />
            </SelectTrigger>
            <SelectContent>
              {cell.dishes.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                  <span className="ml-1 text-xs text-muted-foreground">({d.diet === "veg" ? "V" : "NV"})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </td>
  );
}
