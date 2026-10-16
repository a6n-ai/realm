"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CopyPlus, MoreHorizontal, Plus, Star, Trash2 } from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@foundry/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { cn } from "@foundry/ui/cn";
import { Badge } from "@/components/reui/badge";
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
export type CellRef = { day: DayOfWeek; slotKey: string };
/** A side item row: what it packs each day, and whether a day was changed from its default. */
export type SideRow = { key: string; label: string; sub: string; cell: (day: DayOfWeek) => { text: string; changed: boolean } };

const CREATE_VALUE = "__create__";

/** Server verdicts per cell (`day:slotKey`): "missing" is a plan that gets nothing, "extra" a fixed slot with surplus. */
export function problemsByCell(problems: GridProblem[]) {
  const map = new Map<string, { missing: boolean; extra: boolean }>();
  for (const p of problems) {
    const key = `${p.day}:${p.categoryKey}|${p.planPublicId}`;
    const entry = map.get(key) ?? { missing: false, extra: false };
    if (p.kind === "missing") entry.missing = true; else entry.extra = true;
    map.set(key, entry);
  }
  return map;
}

/**
 * A row's plan comes from its dish — menu_items carries no plan column of its own. So a slot's
 * rows are the category rows whose dish lands on that slot's plan.
 */
export function rowsOf(rows: GridRow[], dishById: Map<string, GridDish>, day: DayOfWeek, slot: Slot) {
  return rows.filter((r) => r.dayOfWeek === day && r.slot === slot.categoryKey && dishById.get(r.dishId)?.planId === slot.planPublicId);
}

// What is wrong with one cell, most serious first: this plan getting nothing beats a shortfall,
// which beats dishes that will never be served.
export function cellWarning(slot: Slot, needed: number, count: number, verdict?: { missing: boolean; extra: boolean }): string | null {
  if (verdict?.missing) return `No dish here for ${slot.planName}`;
  if (slot.selectable && needed > 0 && count > 0 && count < needed) return `Only ${count} of ${needed}: customers have less to choose from than they ordered`;
  if (slot.selectable && count === 1 && needed > 1) return "One dish only: nothing to choose between";
  if (verdict?.extra) return "Only one is served: the rest never reach a plate";
  return null;
}

/**
 * The whole week at a glance: rows are (category, plan) slots, columns are Mon–Sun, and each cell
 * shows its default dish plus how many more. Read-only; clicking a cell opens it in the panel.
 */
export function MenuGrid({
  slots, rows, dishes, categoryCounts, problems, selected, onSelect, sideRows = [],
}: {
  sideRows?: SideRow[];
  slots: Slot[];
  rows: GridRow[];
  dishes: GridDish[];
  categoryCounts: Record<string, number>;
  problems: GridProblem[];
  selected: CellRef | null;
  onSelect: (cell: CellRef) => void;
}) {
  const dishById = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const verdicts = useMemo(() => problemsByCell(problems), [problems]);

  return (
    <div className="bg-card overflow-x-auto rounded-xl border" data-testid="menu-grid">
      <div className="grid min-w-[38rem]" style={{ gridTemplateColumns: `minmax(7rem, 9rem) repeat(${DAYS.length}, minmax(0, 1fr))` }}>
        <div className="text-muted-foreground border-e border-b p-2 text-xs font-medium">Category · Plan</div>
        {DAYS.map((day) => (
          <div key={day} className="border-b p-2 text-xs font-semibold">{DAY_LABELS[day].slice(0, 3)}</div>
        ))}

        {slots.map((slot) => {
          const needed = categoryCounts[slot.key] ?? 0;
          return (
            <div key={slot.key} className="contents">
              <div className="border-e border-b p-2">
                <p className="text-sm font-medium text-pretty">{slot.categoryLabel}</p>
                <p className="text-muted-foreground text-xs">{slot.planName}</p>
              </div>
              {DAYS.map((day) => {
                const cell = rowsOf(rows, dishById, day, slot);
                const verdict = verdicts.get(`${day}:${slot.key}`);
                const warning = cellWarning(slot, needed, cell.length, verdict);
                const lead = cell.find((r) => r.isDefault) ?? cell[0];
                const isSelected = selected?.day === day && selected.slotKey === slot.key;
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`${DAY_LABELS[day]}, ${slot.categoryLabel} (${slot.planName}): ${cell.length ? `${cell.length} ${cell.length === 1 ? "dish" : "dishes"}` : "empty"}${warning ? `, ${warning}` : ""}`}
                    onClick={() => onSelect({ day, slotKey: slot.key })}
                    className={cn(
                      "flex min-h-14 flex-col items-start gap-1 border-b p-1.5 text-left text-xs transition-colors hover:bg-muted/50",
                      verdict?.missing && "bg-warning/10",
                      isSelected && "bg-primary/10 ring-primary ring-2 ring-inset",
                    )}
                  >
                    {lead ? (
                      <>
                        <span className="line-clamp-2 font-medium">{dishById.get(lead.dishId)?.name ?? lead.dishId}</span>
                        {cell.length > 1 && <span className="text-muted-foreground tabular-nums">+{cell.length - 1} more</span>}
                      </>
                    ) : verdict?.missing ? (
                      <span className="text-warning-foreground dark:text-warning font-medium">Missing</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {warning && !verdict?.missing && <span className="bg-warning mt-auto size-1.5 rounded-full" aria-hidden />}
                  </button>
                );
              })}
            </div>
          );
        })}

        {sideRows.length > 0 && (
          <div className="bg-muted/40 text-muted-foreground col-span-full border-b px-2 py-1.5 text-xs font-semibold tracking-wider uppercase">
            Side dishes
          </div>
        )}
        {sideRows.map((side) => (
          <div key={side.key} className="contents">
            <div className="border-e border-b p-2">
              <p className="text-sm font-medium text-pretty">{side.label}</p>
              <p className="text-muted-foreground line-clamp-2 text-xs">{side.sub}</p>
            </div>
            {DAYS.map((day) => {
              const { text, changed } = side.cell(day);
              const isSelected = selected?.day === day && selected.slotKey === side.key;
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${DAY_LABELS[day]}, ${side.label}: packs ${text}${changed ? ", changed for this day" : ""}`}
                  onClick={() => onSelect({ day, slotKey: side.key })}
                  className={cn(
                    "flex min-h-14 flex-col items-start gap-1 border-b p-1.5 text-left text-xs transition-colors hover:bg-muted/50",
                    isSelected && "bg-primary/10 ring-primary ring-2 ring-inset",
                  )}
                >
                  <span className="text-muted-foreground line-clamp-2">{text}</span>
                  {changed && <span className="text-warning-foreground dark:text-warning font-medium">Changed</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** One day × slot: its dishes in order, the default, and everything that edits them. */
export function CellPanel({
  day, slot, needed, rows, dishes, dishById, warning, editable,
  onAdd, onRemove, onMove, onToggleDefault, onCopyAcrossDays, onCreateDish,
}: {
  day: DayOfWeek;
  slot: Slot;
  needed: number;
  rows: GridRow[];
  dishes: GridDish[];
  dishById: Map<string, GridDish>;
  warning: string | null;
  editable: boolean;
  onAdd: (day: DayOfWeek, slot: Slot, dishId: string) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onToggleDefault: (key: string) => void;
  onCopyAcrossDays: (day: DayOfWeek, slot: Slot) => void;
  onCreateDish: (day: DayOfWeek, slot: Slot) => void;
}) {
  const [open, setOpen] = useState(false);
  // Plan-scoped: a dish from the wrong plan is never offered here, even if it shares the category.
  const addable = dishes.filter(
    (d) => !rows.some((r) => r.dishId === d.id) && (d.category == null || d.category === slot.categoryKey) && d.planId === slot.planPublicId,
  );

  return (
    <section aria-label={`${DAY_LABELS[day]} ${slot.categoryLabel}`} data-testid="cell-panel" className="bg-card flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{DAY_LABELS[day]}</p>
        <h3 className="text-lg font-semibold">{slot.categoryLabel}</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{slot.planName}</span>
          <Badge variant={slot.selectable ? "info-light" : "invert-light"}>
            {slot.selectable ? (needed > 0 ? `Customer picks ${needed}` : "Customer picks") : "Fixed"}
          </Badge>
        </div>
      </div>

      {warning && <p className="border-warning/40 bg-warning/10 rounded-lg border px-3 py-2 text-sm">{warning}</p>}

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No dishes yet.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((row, index) => {
            const name = dishById.get(row.dishId)?.name ?? row.dishId;
            return (
              <li key={row.key} className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm", row.isDefault && "border-primary/40 bg-primary/5")}>
                <span className="text-muted-foreground w-4 text-xs tabular-nums">{index + 1}</span>
                <span className="min-w-0 flex-1 text-pretty">{name}</span>
                {row.isDefault && <Badge variant="primary-light"><Star className="size-3 fill-current" aria-hidden />Default</Badge>}
                {editable && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Options for ${name}`}><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onToggleDefault(row.key)}>
                        <Star />{row.isDefault ? "Unset default" : "Set as default"}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(row.key, -1)}><ArrowUp />Move up</DropdownMenuItem>
                      <DropdownMenuItem disabled={index === rows.length - 1} onSelect={() => onMove(row.key, 1)}><ArrowDown />Move down</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => onRemove(row.key)}><Trash2 />Remove</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {editable && (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" aria-label={`Add a dish to ${slot.categoryLabel} (${slot.planName}) on ${DAY_LABELS[day]}`}>
                <Plus data-icon="inline-start" />Add dish
              </Button>
            </PopoverTrigger>
            {/* Typing filters; Enter takes the highlighted dish; Escape closes. */}
            <PopoverContent className="w-72 p-0" align="start">
              <Command>
                <CommandInput placeholder={`Add to ${slot.categoryLabel} (${slot.planName})…`} />
                <CommandList>
                  <CommandEmpty>No dish in this category.</CommandEmpty>
                  <CommandGroup>
                    {addable.map((d) => (
                      <CommandItem key={d.id} value={d.name} onSelect={() => { onAdd(day, slot, d.id); setOpen(false); }}>
                        {d.name}
                      </CommandItem>
                    ))}
                    <CommandItem value={CREATE_VALUE} className="text-primary" onSelect={() => { onCreateDish(day, slot); setOpen(false); }}>
                      <Plus /> Create new dish…
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {rows.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onCopyAcrossDays(day, slot)}>
              <CopyPlus data-icon="inline-start" />Copy {DAY_LABELS[day]} to every day
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
