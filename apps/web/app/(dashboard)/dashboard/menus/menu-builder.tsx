"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addItem, releaseWeek, removeItem, setDefault, upsertWeek } from "./actions";

type Slot = { key: string; label: string; sortOrder: number };
type Dish = { id: string; name: string; diet: "veg" | "nonveg"; slots: string[] };
type MenuItem = {
  id: string;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  slot: string;
  dishId: string;
  isDefault: boolean;
};
type Week = { id: string; weekStart: string; status: string; orderCutoff: string };

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Day = (typeof DAYS)[number];

const DAY_LABELS: Record<Day, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

export function MenuBuilder({
  slots,
  dishes,
  week,
  items,
}: {
  slots: Slot[];
  dishes: Dish[];
  week: Week | null;
  items: MenuItem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(week?.weekStart ?? "");
  const [orderCutoff, setOrderCutoff] = useState(
    week?.orderCutoff ? new Date(week.orderCutoff).toISOString().slice(0, 16) : ""
  );

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    });

  const handleUpsertWeek = () => {
    if (!weekStart || !orderCutoff) return;
    run(async () => {
      const w = await upsertWeek({ weekStart, orderCutoff: new Date(orderCutoff).toISOString() });
      router.push(`/dashboard/menus?week=${w.publicId}`);
    });
  };

  const getItems = (day: Day, slotKey: string) =>
    items.filter((i) => i.dayOfWeek === day && i.slot === slotKey);

  const dishesForSlot = (slotKey: string) =>
    dishes.filter((d) => d.slots.includes(slotKey));

  return (
    <div className="space-y-6">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Week start (Monday)</label>
          <input
            type="date"
            className="rounded-md border px-3 py-2 text-sm"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Order cutoff</label>
          <input
            type="datetime-local"
            className="rounded-md border px-3 py-2 text-sm"
            value={orderCutoff}
            onChange={(e) => setOrderCutoff(e.target.value)}
          />
        </div>
        <Button onClick={handleUpsertWeek} disabled={pending || !weekStart || !orderCutoff}>
          {week ? "Update week" : "Create week"}
        </Button>
        {week && week.status === "draft" && (
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => run(() => releaseWeek(week.id))}
          >
            Release
          </Button>
        )}
        {week && week.status === "released" && (
          <span className="text-sm text-muted-foreground">Released</span>
        )}
      </div>

      {week && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border p-2 text-left">Day</th>
                {slots.map((s) => (
                  <th key={s.key} className="border p-2 text-left">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day) => (
                <tr key={day}>
                  <td className="border p-2 font-medium">{DAY_LABELS[day]}</td>
                  {slots.map((slot) => {
                    const cellItems = getItems(day, slot.key);
                    const slotDishes = dishesForSlot(slot.key);
                    const addableDishes = slotDishes.filter(
                      (d) => !cellItems.some((i) => i.dishId === d.id)
                    );
                    return (
                      <td key={slot.key} className="border p-2 align-top">
                        <div className="space-y-1">
                          {cellItems.map((item) => {
                            const dish = dishes.find((d) => d.id === item.dishId);
                            return (
                              <div key={item.id} className="flex items-center gap-1">
                                <span className={item.isDefault ? "font-medium" : ""}>
                                  {dish?.name ?? item.dishId}
                                </span>
                                {!item.isDefault && (
                                  <button
                                    className="text-xs text-muted-foreground underline"
                                    disabled={pending}
                                    onClick={() => run(() => setDefault(item.id))}
                                  >
                                    default
                                  </button>
                                )}
                                {item.isDefault && (
                                  <span className="text-xs text-muted-foreground">★</span>
                                )}
                                <button
                                  className="text-xs text-destructive"
                                  disabled={pending}
                                  onClick={() => run(() => removeItem(item.id))}
                                >
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                          {addableDishes.length > 0 && week.status === "draft" && (
                            <Select
                              onValueChange={(dishId) =>
                                run(() =>
                                  addItem({
                                    menuWeekId: week.id,
                                    dayOfWeek: day,
                                    slot: slot.key,
                                    dishId,
                                    isDefault: cellItems.length === 0,
                                  }).then(() => {})
                                )
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="+ add dish" />
                              </SelectTrigger>
                              <SelectContent>
                                {addableDishes.map((d) => (
                                  <SelectItem key={d.id} value={d.id}>
                                    {d.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
