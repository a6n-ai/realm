"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, CopyPlus, Plus, Star, X } from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@realm/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@realm/ui/popover";
import { cn } from "@realm/ui/cn";
import { DAYS, DAY_LABELS, type DayOfWeek } from "@/lib/menu/poster";

export type GridRow = { key: string; id: string | null; dayOfWeek: DayOfWeek; slot: string; dishId: string; isDefault: boolean };
export type GridDish = { id: string; name: string; category: string | null };
export type GridCategory = { key: string; label: string; selectable: boolean; sortOrder: number };
export type GridProblem = {
  kind: "missing" | "extra";
  day: string;
  planName: string;
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
  categories, rows, dishes, categoryCounts, problems, editable,
  onAdd, onRemove, onMove, onToggleDefault, onCopyAcrossDays, onCreateDish,
}: {
  categories: GridCategory[];
  rows: GridRow[];
  dishes: GridDish[];
  categoryCounts: Record<string, number>;
  problems: GridProblem[];
  editable: boolean;
  onAdd: (day: DayOfWeek, slot: string, dishId: string) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onToggleDefault: (key: string) => void;
  onCopyAcrossDays: (day: DayOfWeek, slot: string) => void;
  onCreateDish: (day: DayOfWeek, slot: string) => void;
}) {
  const dishById = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);

  // Server verdicts per cell, keyed for O(1) lookup while rendering 77 of them. Split by
  // kind: "missing" is a plan that gets nothing here, "extra" is a fixed category holding
  // more than one dish for the SAME plan (only that surplus is dead — see below).
  const problemsByCell = useMemo(() => {
    const map = new Map<string, { missing: string[]; extra: string[] }>();
    for (const p of problems) {
      const key = `${p.day}:${p.categoryKey}`;
      const entry = map.get(key) ?? { missing: [], extra: [] };
      entry[p.kind === "missing" ? "missing" : "extra"].push(p.planName);
      map.set(key, entry);
    }
    return map;
  }, [problems]);

  const cellRows = (day: DayOfWeek, slot: string) => rows.filter((r) => r.dayOfWeek === day && r.slot === slot);

  return (
    // The grid is wider than a phone and must scroll inside its own container — the page
    // body never scrolls sideways. The height cap is what makes the sticky day header and
    // sticky category column work: they stick to this box, so it has to be the scroller.
    <div className="max-h-[70vh] overflow-auto rounded-2xl border shadow-sm">
      <div
        className="grid min-w-max"
        style={{ gridTemplateColumns: `minmax(9rem, 11rem) repeat(${DAYS.length}, minmax(12rem, 1fr))` }}
      >
        <div className="sticky left-0 top-0 z-20 border-b border-r bg-background p-3 text-xs font-medium text-muted-foreground">
          Category
        </div>
        {DAYS.map((day) => {
          const count = categories.reduce((n, c) => n + cellRows(day, c.key).length, 0);
          return (
            <div key={day} className="sticky top-0 z-10 border-b bg-background p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{DAY_LABELS[day]}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
              </div>
            </div>
          );
        })}

        {categories.map((category) => {
          const needed = categoryCounts[category.key] ?? 0;
          return (
            <div key={category.key} className="contents">
              <div className="sticky left-0 z-10 border-b border-r bg-background p-3">
                <p className="text-sm font-medium text-pretty">{category.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {category.selectable
                    ? needed > 0 ? <>Customer picks <span className="tabular-nums">{needed}</span></> : "Customer picks"
                    : "Fixed"}
                </p>
              </div>

              {DAYS.map((day) => (
                <Cell
                  key={`${category.key}-${day}`}
                  day={day}
                  category={category}
                  needed={needed}
                  rows={cellRows(day, category.key)}
                  dishes={dishes}
                  dishById={dishById}
                  missingForPlans={problemsByCell.get(`${day}:${category.key}`)?.missing ?? []}
                  surplusForPlans={problemsByCell.get(`${day}:${category.key}`)?.extra ?? []}
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
  day, category, needed, rows, dishes, dishById, missingForPlans, surplusForPlans, editable,
  onAdd, onRemove, onMove, onToggleDefault, onCopyAcrossDays, onCreateDish,
}: {
  day: DayOfWeek;
  category: GridCategory;
  needed: number;
  rows: GridRow[];
  dishes: GridDish[];
  dishById: Map<string, GridDish>;
  missingForPlans: string[];
  surplusForPlans: string[];
  editable: boolean;
  onAdd: (day: DayOfWeek, slot: string, dishId: string) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onToggleDefault: (key: string) => void;
  onCopyAcrossDays: (day: DayOfWeek, slot: string) => void;
  onCreateDish: (day: DayOfWeek, slot: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // Each warning names what is wrong with THIS cell, in the order that matters: a plan
  // getting nothing beats a shortfall, which beats dishes that will never be served.
  const warning =
    missingForPlans.length > 0
      ? `No dish here for ${missingForPlans.join(", ")}`
      : category.selectable && needed > 0 && rows.length > 0 && rows.length < needed
        ? `Only ${rows.length} of ${needed} — customers have less to choose from than they ordered`
        : category.selectable && rows.length === 1 && needed > 1
          ? "One dish only — nothing to choose between"
          : surplusForPlans.length > 0
            // NOT a plain "more than one dish" check. A fixed category serves one dish per
            // subscriber, but several rows here can be right — one per plan, since plan
            // membership filters before the default is picked. Only dishes competing for the
            // SAME plan are dead, and only the server knows membership.
            ? `Only one is served to ${surplusForPlans.join(", ")} — the rest never reach a plate`
            : null;

  const addable = dishes.filter(
    (d) => !rows.some((r) => r.dishId === d.id) && (d.category == null || d.category === category.key),
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
                aria-label={`Add a dish to ${category.label} on ${DAY_LABELS[day]}`}
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
                <CommandInput placeholder={`Add to ${category.label}…`} />
                <CommandList>
                  <CommandEmpty>No dish in this category.</CommandEmpty>
                  <CommandGroup>
                    {addable.map((d) => (
                      <CommandItem
                        key={d.id}
                        value={d.name}
                        onSelect={() => { onAdd(day, category.key, d.id); setOpen(false); }}
                      >
                        {d.name}
                      </CommandItem>
                    ))}
                    <CommandItem
                      value={CREATE_VALUE}
                      className="text-primary"
                      onSelect={() => { onCreateDish(day, category.key); setOpen(false); }}
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
              aria-label={`Copy ${DAY_LABELS[day]}'s ${category.label} to every day`}
              title="Copy to every day"
              onClick={() => onCopyAcrossDays(day, category.key)}
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
