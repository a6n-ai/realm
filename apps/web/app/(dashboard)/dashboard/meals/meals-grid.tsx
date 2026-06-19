"use client";

import { useState, useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pickDish } from "./actions";
import type { GridCell } from "./page";

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

type SlotMeta = { key: string; label: string; sortOrder: number };

type Props = {
  orderId: string;
  menuWeekId: string;
  grid: GridCell[];
  isLocked: boolean;
  persons: number;
  deliveryDays: DayOfWeek[];
  enabledSlots: SlotMeta[];
};

export function MealsGrid({ orderId, menuWeekId, grid, isLocked, persons, deliveryDays, enabledSlots }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border p-2 text-left">Day</th>
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
          {deliveryDays.map((day) => (
            <tr key={day}>
              <td className="border p-2 font-medium">{DAY_LABELS[day]}</td>
              {enabledSlots.map((slot) =>
                Array.from({ length: persons }, (_, i) => {
                  const personIndex = i + 1;
                  const cell = grid.find(
                    (c) => c.day === day && c.slot === slot.key && c.personIndex === personIndex
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
                      key={`${day}-${slot.key}-${personIndex}`}
                      cell={cell}
                      isLocked={isLocked}
                      orderId={orderId}
                      menuWeekId={menuWeekId}
                    />
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellSelect({
  cell,
  isLocked,
  orderId,
  menuWeekId,
}: {
  cell: GridCell;
  isLocked: boolean;
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
        {isLocked ? (
          <span className="text-sm">
            {cell.dishes.find((d) => d.id === cell.selectedDishId)?.name ?? "—"}
          </span>
        ) : (
          <Select
            value={cell.selectedDishId ?? undefined}
            onValueChange={handleChange}
            disabled={isLocked}
          >
            <SelectTrigger className="h-8 min-w-[140px] text-xs">
              <SelectValue placeholder="Choose dish" />
            </SelectTrigger>
            <SelectContent>
              {cell.dishes.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({d.diet === "veg" ? "V" : "NV"})
                  </span>
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
