"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Badge } from "@/components/reui/badge";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { DAY_LABELS, type DayOfWeek } from "@/lib/menu/poster";
import { sanitizeClientError } from "@/lib/format/client-error";
import type { DaySide, DaySideValue, SideRole, SideSlot } from "@/lib/services/menu-sides.service";
import type { ActionResult } from "@/app/(customer)/me/action-result";
import { setDaySide, setSideDefault } from "./actions";

export type SideCategory = { key: string; label: string };
export type DayDish = { publicId: string; name: string; category: string; isDefault: boolean };
export type SidesInput = { weekId: string; slots: SideSlot[]; categories: SideCategory[]; daySides: DaySide[] };

const ROLE_LABEL: Record<SideRole, string> = { side_1: "Side 1", side_2: "Side 2" };
const DEFAULT = "default";
const NONE = "none";

export const sideKey = (slot: Pick<SideSlot, "category" | "role">) => `side:${slot.category}:${slot.role}`;
export const sideLabel = (slot: SideSlot) => `${slot.categoryLabel} · ${ROLE_LABEL[slot.role]}`;

const encode = (v: DaySideValue): string =>
  v == null ? DEFAULT : v.kind === "category" ? `cat:${v.key}` : `dish:${v.dishPublicId}`;
const decode = (s: string): DaySideValue =>
  s === DEFAULT ? null : s.startsWith("cat:") ? { kind: "category", key: s.slice(4) } : { kind: "dish", dishPublicId: s.slice(5) };

/**
 * Side dishes for 5 Item / Maharaja / Sabzi Only meals: their side items (meal sizes, Role
 * "Side 1/2") pack a dish from another category on the day's menu, the day's dal by default.
 * One state for the grid rows and the panel; every change saves on its own, outside the menu draft.
 */
export function useSides(input: SidesInput | undefined, dayDishes: Partial<Record<DayOfWeek, DayDish[]>>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState(() =>
    new Map((input?.daySides ?? []).map((d) => [`${d.day}:${d.category}:${d.role}`, encode(d.source)])),
  );
  const [defaults, setDefaults] = useState(() => new Map((input?.slots ?? []).map((s) => [`${s.category}:${s.role}`, s.defaultSource])));
  const categories = input?.categories ?? [];
  const catLabel = (key: string) => categories.find((c) => c.key === key)?.label ?? key;

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if ("error" in res) setError(sanitizeClientError(res.error));
      else router.refresh();
    });

  const valueOf = (day: DayOfWeek, slot: SideSlot) => overrides.get(`${day}:${slot.category}:${slot.role}`) ?? DEFAULT;
  const standingOf = (slot: SideSlot) => defaults.get(`${slot.category}:${slot.role}`) ?? null;

  // What the side packs on that day, as the kitchen sheet will print it.
  const packs = (day: DayOfWeek, slot: SideSlot): string => {
    const value = valueOf(day, slot);
    const dishes = dayDishes[day] ?? [];
    const fromCategory = (key: string) => {
      const inCat = dishes.filter((d) => d.category === key);
      return (inCat.find((d) => d.isDefault) ?? inCat[0])?.name;
    };
    if (value.startsWith("dish:")) return dishes.find((d) => d.publicId === value.slice(5))?.name ?? "—";
    const source = value.startsWith("cat:") ? value.slice(4) : standingOf(slot);
    if (!source) return `Same as ${slot.categoryLabel.toLowerCase()} main`;
    return fromCategory(source) ?? `No ${catLabel(source).toLowerCase()} on the menu (falls back to ${slot.categoryLabel.toLowerCase()})`;
  };

  return {
    slots: input?.slots ?? [],
    categories,
    catLabel,
    pending,
    error,
    valueOf,
    standingOf,
    packs,
    /** A day differs from the standing default. */
    changed: (day: DayOfWeek, slot: SideSlot) => valueOf(day, slot) !== DEFAULT,
    setDay: (day: DayOfWeek, slot: SideSlot, v: string) => {
      setOverrides((m) => new Map(m).set(`${day}:${slot.category}:${slot.role}`, v));
      run(() => setDaySide({ weekId: input!.weekId, day, category: slot.category, role: slot.role, value: decode(v) }));
    },
    setDefault: (slot: SideSlot, v: string) => {
      const source = v === NONE ? null : v;
      setDefaults((m) => new Map(m).set(`${slot.category}:${slot.role}`, source));
      run(() => setSideDefault({ category: slot.category, role: slot.role, source }));
    },
  };
}

export type Sides = ReturnType<typeof useSides>;

/** One side on one day: what it packs, the day's source, and the standing default for every week. */
export function SidePanel({ day, slot, sides, dishesOfDay }: { day: DayOfWeek; slot: SideSlot; sides: Sides; dishesOfDay: DayDish[] }) {
  const standing = sides.standingOf(slot);
  return (
    <section aria-label={`${DAY_LABELS[day]} ${sideLabel(slot)}`} data-testid="side-panel" className="bg-card flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{DAY_LABELS[day]}</p>
        <h3 className="text-lg font-semibold">{sideLabel(slot)}</h3>
        <p className="text-muted-foreground text-xs">{slot.meals.join(" · ")}</p>
      </div>

      <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
        <span className="text-muted-foreground">Packs</span>
        <span className="font-medium">{sides.packs(day, slot)}</span>
        {sides.changed(day, slot) && <Badge variant="warning-light">Changed for this day</Badge>}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">This day</span>
        <Select value={sides.valueOf(day, slot)} disabled={sides.pending} onValueChange={(v) => sides.setDay(day, slot, v)}>
          <SelectTrigger aria-label={`${DAY_LABELS[day]} source`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT}>Default{standing ? ` (${sides.catLabel(standing)})` : ""}</SelectItem>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Category</SelectLabel>
              {sides.categories.map((c) => <SelectItem key={c.key} value={`cat:${c.key}`}>{c.label}</SelectItem>)}
            </SelectGroup>
            {dishesOfDay.length ? (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Dish on this day</SelectLabel>
                  {dishesOfDay.map((d) => <SelectItem key={d.publicId} value={`dish:${d.publicId}`}>{d.name}</SelectItem>)}
                </SelectGroup>
              </>
            ) : null}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs">
          Change a day only when the kitchen makes something else. Default{standing ? ` packs the day's ${sides.catLabel(standing).toLowerCase()}` : " repeats the main"}; change it under Side dishes, Defaults.
        </span>
      </label>

      <p className="text-muted-foreground border-t pt-3 text-xs">Side dishes save as you pick, outside Amend and Publish. On a released menu the change is live straight away.</p>
      {sides.error ? <p className="text-destructive text-sm" role="alert">{sides.error}</p> : null}
    </section>
  );
}

/** The standing source per side, for every week: kept apart from the day-by-day choices. */
export function SideDefaultsDialog({ sides }: { sides: Sides }) {
  const [open, setOpen] = useState(false);
  if (sides.slots.length === 0) return null;
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>Defaults</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Side dish defaults</DialogTitle>
            <DialogDescription>What each side packs every day, in every week, unless a day is changed on the menu. Saved as you pick.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {sides.slots.map((slot) => (
              <label key={sideKey(slot)} className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{sideLabel(slot)}</span>
                <span className="text-muted-foreground text-xs">{slot.meals.join(" · ")}</span>
                <Select value={sides.standingOf(slot) ?? NONE} disabled={sides.pending} onValueChange={(v) => sides.setDefault(slot, v)}>
                  <SelectTrigger aria-label={`${sideLabel(slot)} default`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Same as {slot.categoryLabel.toLowerCase()} main</SelectItem>
                    {sides.categories.map((cat) => <SelectItem key={cat.key} value={cat.key}>{cat.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            ))}
            {sides.error ? <p className="text-destructive text-sm" role="alert">{sides.error}</p> : null}
          </div>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
