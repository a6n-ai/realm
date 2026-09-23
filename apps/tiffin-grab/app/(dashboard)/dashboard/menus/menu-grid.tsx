"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, CopyPlus, Plus, Star, X } from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@foundry/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { cn } from "@foundry/ui/cn";
import { DAYS, DAY_LABELS, type DayOfWeek } from "@/lib/menu/poster";

export type GridRow = { key: string; id: string | null; dayOfWeek: DayOfWeek; slot: string; dishId: string; isDefault: boolean };
export type GridDish = { id: string; name: string; category: string | null; planId: string };
/** One (category, plan) pair a day's menu needs to fill — one grid cell per slot. */
export type Slot = {
  key: string; // `${categoryKey}|${planPublicId}`
  categoryKey: string;
  categoryLabel: string;
  selectable: boolean;
  sortOrder: number;
  planPublicId: string;
  planName: string;
};
export type GridProblem = {
  kind: "missing" | "extra";
  day: string;
  planName: string;
  planPublicId: string;
  categoryKey: string;
  categoryLabel: string;
  dishNames: string[];
};

const CREATE_VALUE = "__create__";

/**
 * Icon buttons are 32px so the chips stay compact, but a 32px tap target is below the
 * 40px floor. The pseudo-element widens the hit area without moving anything visually.
 */
const ICON_BUTTON =
  "relative flex size-8 shrink-0 items-center justify-center rounded-md transition-colors " +
  "before:absolute before:-inset-1 before:content-[''] active:scale-[0.96] disabled:opacity-50";

export function MenuGrid({
  slots, rows, dishes, categoryCounts, problems, editable,
  onAdd, onRemove, onMove, onToggleDefault, onCopyAcrossDays, onCreateDish,
}: {
  slots: Slot[];
  rows: GridRow[];
  dishes: GridDish[];
  categoryCounts: Record<string, number>;
  problems: GridProblem[];
  editable: boolean;
  onAdd: (day: DayOfWeek, slot: Slot, dishId: string) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onToggleDefault: (key: string) => void;
  onCopyAcrossDays: (day: DayOfWeek, slot: Slot) => void;
  onCreateDish: (day: DayOfWeek, slot: Slot) => void;
}) {
  const dishById = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);

  // Server verdicts per cell, keyed for O(1) lookup while rendering ~150 of them (one per
  // slot x day). Split by kind: "missing" is a plan that gets nothing here, "extra" is a
  // fixed category holding more than one dish for the SAME plan (only that surplus is dead).
  const problemsByCell = useMemo(() => {
    const map = new Map<string, { missing: boolean; extra: boolean }>();
    for (const p of problems) {
      const key = `${p.day}:${p.categoryKey}|${p.planPublicId}`;
      const entry = map.get(key) ?? { missing: false, extra: false };
      if (p.kind === "missing") entry.missing = true; else entry.extra = true;
      map.set(key, entry);
    }
    return map;
  }, [problems]);

  // A row's plan comes from its dish — menu_items carries no plan column of its own, it's
  // always the dish's single plan. So a slot's rows are the category rows whose dish lands
  // on that slot's plan.
  const cellRows = (day: DayOfWeek, slot: Slot) =>
    rows.filter((r) => r.dayOfWeek === day && r.slot === slot.categoryKey && dishById.get(r.dishId)?.planId === slot.planPublicId);

  return (
    // The grid is wider than a phone and must scroll inside its own container — the page
    // body never scrolls sideways. The height cap is what makes the sticky day header and
    // sticky category column work: they stick to this box, so it has to be the scroller.
    <div className="max-h-[70vh] overflow-auto rounded-2xl border shadow-sm">
      <div
        className="grid min-w-max"
        style={{ gridTemplateColumns: `minmax(9rem, 12rem) repeat(${DAYS.length}, minmax(12rem, 1fr))` }}
      >
        <div className="sticky left-0 top-0 z-20 border-b border-r bg-background p-3 text-xs font-medium text-muted-foreground">
          Category · Plan
        </div>
        {DAYS.map((day) => {
          const count = slots.reduce((n, s) => n + cellRows(day, s).length, 0);
          return (
            <div key={day} className="sticky top-0 z-10 border-b bg-background p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{DAY_LABELS[day]}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
              </div>
            </div>
          );
        })}

        {slots.map((slot) => {
          const needed = categoryCounts[slot.key] ?? 0;
          return (
            <div key={slot.key} className="contents">
              <div className="sticky left-0 z-10 border-b border-r bg-background p-3">
                <p className="text-sm font-medium text-pretty">{slot.categoryLabel}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{slot.planName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {slot.selectable
                    ? needed > 0 ? <>Customer picks <span className="tabular-nums">{needed}</span></> : "Customer picks"
                    : "Fixed"}
                </p>
              </div>

              {DAYS.map((day) => (
                <Cell
                  key={`${slot.key}-${day}`}
                  day={day}
                  slot={slot}
                  needed={needed}
                  rows={cellRows(day, slot)}
                  dishes={dishes}
                  dishById={dishById}
                  missing={problemsByCell.get(`${day}:${slot.key}`)?.missing ?? false}
                  hasSurplus={problemsByCell.get(`${day}:${slot.key}`)?.extra ?? false}
                  editable={editable}
                  onAdd={onAdd}
                  onRemove={onRemove}
                  onMove={onMove}
                  onToggleDefault={onToggleDefault}
                  onCopyAcrossDays={onCopyAcrossDays}
                  onCreateDish={onCreateDish}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cell({
  day, slot, needed, rows, dishes, dishById, missing, hasSurplus, editable,
  onAdd, onRemove, onMove, onToggleDefault, onCopyAcrossDays, onCreateDish,
}: {
  day: DayOfWeek;
  slot: Slot;
  needed: number;
  rows: GridRow[];
  dishes: GridDish[];
  dishById: Map<string, GridDish>;
  missing: boolean;
  hasSurplus: boolean;
  editable: boolean;
  onAdd: (day: DayOfWeek, slot: Slot, dishId: string) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onToggleDefault: (key: string) => void;
  onCopyAcrossDays: (day: DayOfWeek, slot: Slot) => void;
  onCreateDish: (day: DayOfWeek, slot: Slot) => void;
}) {
  const [open, setOpen] = useState(false);

  // Each warning names what is wrong with THIS cell, in the order that matters: this plan
  // getting nothing beats a shortfall, which beats dishes that will never be served. A cell
  // is already one (category, plan) slot, so there's only ever one plan to name.
  const warning =
    missing
      ? `No dish here for ${slot.planName}`
      : slot.selectable && needed > 0 && rows.length > 0 && rows.length < needed
        ? `Only ${rows.length} of ${needed} — customers have less to choose from than they ordered`
        : slot.selectable && rows.length === 1 && needed > 1
          ? "One dish only — nothing to choose between"
          : hasSurplus
            // A fixed category serves one dish per subscriber — anything past the first in
            // this slot never reaches a plate.
            ? `Only one is served — the rest never reach a plate`
            : null;

  // Plan-scoped: a dish from the wrong plan is never offered here, even if it shares
  // the category — that's the whole point of slotting by (category, plan).
  const addable = dishes.filter(
    (d) => !rows.some((r) => r.dishId === d.id) && (d.category == null || d.category === slot.categoryKey) && d.planId === slot.planPublicId,
  );

  return (
    <div className={cn("group/cell border-b p-2", warning && "bg-warn/5 ring-1 ring-inset ring-warn/30")}>
      <div className="space-y-1">
        {rows.map((row, index) => {
          const dish = dishById.get(row.dishId);
          return (
            <div
              key={row.key}
              className={cn(
                "group flex animate-in fade-in slide-in-from-top-1 items-center gap-1 rounded-lg py-1 pl-2 pr-0.5 text-sm duration-200",
                row.isDefault ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/40",
              )}
            >
              <span className="flex-1 text-pretty leading-snug">{dish?.name ?? row.dishId}</span>
              {editable && (
                <>
                  <button
                    className={cn(ICON_BUTTON, "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:text-foreground")}
                    disabled={index === 0}
                    aria-label={`Move ${dish?.name ?? "dish"} up`}
                    onClick={() => onMove(row.key, -1)}
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    className={cn(ICON_BUTTON, "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:text-foreground")}
                    disabled={index === rows.length - 1}
                    aria-label={`Move ${dish?.name ?? "dish"} down`}
                    onClick={() => onMove(row.key, 1)}
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                  <button
                    className={cn(ICON_BUTTON, row.isDefault
                      ? "text-primary"
                      : "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:text-primary")}
                    aria-pressed={row.isDefault}
                    aria-label={row.isDefault ? `Unset ${dish?.name ?? "dish"} as default` : `Set ${dish?.name ?? "dish"} as default`}
                    title={row.isDefault ? "Served unless the customer picks otherwise" : "Set as default"}
                    onClick={() => onToggleDefault(row.key)}
                  >
                    <Star className={cn("size-3.5", row.isDefault && "fill-current")} />
                  </button>
                  <button
                    className={cn(ICON_BUTTON, "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-destructive/10 hover:text-destructive")}
                    aria-label={`Remove ${dish?.name ?? "dish"}`}
                    onClick={() => onRemove(row.key)}
                  >
                    <X className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {editable && (
        <div className="mt-1 flex items-center gap-1">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={`Add a dish to ${slot.categoryLabel} (${slot.planName}) on ${DAY_LABELS[day]}`}
                className="flex h-9 flex-1 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground active:scale-[0.96]"
              >
                <Plus className="size-3.5" />
                {rows.length === 0 ? "Add dish" : "Add"}
              </button>
            </PopoverTrigger>
            {/* Typing filters; Enter takes the highlighted dish; Escape closes. cmdk owns
                the arrow keys, so the whole cell is reachable without the mouse. */}
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder={`Add to ${slot.categoryLabel} (${slot.planName})…`} />
                <CommandList>
                  <CommandEmpty>No dish in this category.</CommandEmpty>
                  <CommandGroup>
                    {addable.map((d) => (
                      <CommandItem
                        key={d.id}
                        value={d.name}
                        onSelect={() => { onAdd(day, slot, d.id); setOpen(false); }}
                      >
                        {d.name}
                      </CommandItem>
                    ))}
                    <CommandItem
                      value={CREATE_VALUE}
                      className="text-primary"
                      onSelect={() => { onCreateDish(day, slot); setOpen(false); }}
                    >
                      <Plus className="size-3.5" /> Create new dish…
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {rows.length > 0 && (
            <button
              type="button"
              className={cn(ICON_BUTTON, "text-muted-foreground opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:text-foreground")}
              aria-label={`Copy ${DAY_LABELS[day]}'s ${slot.categoryLabel} (${slot.planName}) to every day`}
              title="Copy to every day"
              onClick={() => onCopyAcrossDays(day, slot)}
            >
              <CopyPlus className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {warning && <p className="mt-1 text-[11px] leading-snug text-warn">{warning}</p>}
    </div>
  );
}
