"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { DAY_LABELS, type DayOfWeek } from "@/lib/menu/poster";
import { sanitizeClientError } from "@/lib/format/client-error";
import type { DaySide, DaySideValue, SideRole, SideSlot } from "@/lib/services/menu-sides.service";
import type { ActionResult } from "@/app/(customer)/me/action-result";
import { setDaySide, setSideDefault } from "./actions";

type Category = { key: string; label: string };
type DayDish = { publicId: string; name: string; category: string; isDefault: boolean };

const ROLE_LABEL: Record<SideRole, string> = { side_1: "Side 1", side_2: "Side 2" };
const DEFAULT = "default";
const NONE = "none";

const encode = (v: DaySideValue): string =>
  v == null ? DEFAULT : v.kind === "category" ? `cat:${v.key}` : `dish:${v.dishPublicId}`;
const decode = (s: string): DaySideValue =>
  s === DEFAULT ? null : s.startsWith("cat:") ? { kind: "category", key: s.slice(4) } : { kind: "dish", dishPublicId: s.slice(5) };

/**
 * Side dishes for 5 Item / Maharaja / Sabzi Only meals: their side items (meal sizes →
 * Role "Side 1/2") take a dish from another category on the day's menu, the day's dal by
 * default. Saved on change, outside the menu draft.
 */
export function SideDishesCard({
  weekId, slots, categories, days, dayDishes, daySides,
}: {
  weekId: string;
  slots: SideSlot[];
  categories: Category[];
  days: DayOfWeek[];
  dayDishes: Partial<Record<DayOfWeek, DayDish[]>>;
  daySides: DaySide[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState(() =>
    new Map(daySides.map((d) => [`${d.day}:${d.category}:${d.role}`, encode(d.source)])),
  );
  const [defaults, setDefaults] = useState(() => new Map(slots.map((s) => [`${s.category}:${s.role}`, s.defaultSource])));
  const catLabel = (key: string) => categories.find((c) => c.key === key)?.label ?? key;

  if (slots.length === 0) return null;

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if ("error" in res) setError(sanitizeClientError(res.error));
      else router.refresh();
    });

  // What the side packs on that day, as the kitchen sheet will print it.
  const result = (day: DayOfWeek, slot: SideSlot, value: string): string => {
    const dishes = dayDishes[day] ?? [];
    const fromCategory = (key: string) => {
      const inCat = dishes.filter((d) => d.category === key);
      return (inCat.find((d) => d.isDefault) ?? inCat[0])?.name;
    };
    if (value.startsWith("dish:")) return dishes.find((d) => d.publicId === value.slice(5))?.name ?? "—";
    const source = value.startsWith("cat:") ? value.slice(4) : defaults.get(`${slot.category}:${slot.role}`);
    if (!source) return `Same as ${slot.categoryLabel.toLowerCase()} main`;
    return fromCategory(source) ?? `No ${catLabel(source).toLowerCase()} on the menu (falls back to ${slot.categoryLabel.toLowerCase()})`;
  };

  return (
    <section className="mt-6 grid gap-4 border-t pt-5">
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold">Side dishes</h3>
        <p className="text-muted-foreground text-xs">
          Meals with a side item pack the day&apos;s dish from the chosen category in that box. Change a day only when the kitchen makes something else.
        </p>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>

      {slots.map((slot) => {
        const slotKey = `${slot.category}:${slot.role}`;
        const standing = defaults.get(slotKey) ?? null;
        return (
          <div key={slotKey} className="grid gap-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">{slot.categoryLabel} · {ROLE_LABEL[slot.role]}</span>
                <span className="text-muted-foreground text-xs">{slot.meals.join(" · ")}</span>
              </div>
              <label className="grid gap-1">
                <span className="text-muted-foreground text-xs">Default every day</span>
                <Select
                  value={standing ?? NONE}
                  disabled={pending}
                  onValueChange={(v) => {
                    const source = v === NONE ? null : v;
                    setDefaults((m) => new Map(m).set(slotKey, source));
                    run(() => setSideDefault({ category: slot.category, role: slot.role, source }));
                  }}
                >
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Same as {slot.categoryLabel.toLowerCase()} main</SelectItem>
                    {categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className="grid gap-2">
              {days.map((day) => {
                const key = `${day}:${slot.category}:${slot.role}`;
                const value = overrides.get(key) ?? DEFAULT;
                const dishes = dayDishes[day] ?? [];
                return (
                  <div key={day} className="grid grid-cols-[3.5rem_minmax(0,16rem)_minmax(0,1fr)] items-center gap-3">
                    <span className="text-sm font-medium">{DAY_LABELS[day]}</span>
                    <Select
                      value={value}
                      disabled={pending}
                      onValueChange={(v) => {
                        setOverrides((m) => new Map(m).set(key, v));
                        run(() => setDaySide({ weekId, day, category: slot.category, role: slot.role, value: decode(v) }));
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DEFAULT}>
                          Default{standing ? ` (${catLabel(standing)})` : ""}
                        </SelectItem>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Category</SelectLabel>
                          {categories.map((c) => <SelectItem key={c.key} value={`cat:${c.key}`}>{c.label}</SelectItem>)}
                        </SelectGroup>
                        {dishes.length ? (
                          <>
                            <SelectSeparator />
                            <SelectGroup>
                              <SelectLabel>Dish on this day</SelectLabel>
                              {dishes.map((d) => <SelectItem key={d.publicId} value={`dish:${d.publicId}`}>{d.name}</SelectItem>)}
                            </SelectGroup>
                          </>
                        ) : null}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground truncate text-sm">→ {result(day, slot, value)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
