"use client";

import * as React from "react";
import { ChevronsUpDownIcon, XIcon } from "lucide-react";
import { tzOffsetMinutes } from "@foundry/commons";
import type { planType } from "@/db/schema/catalog";
import { KIND_LABELS, ALL_KINDS, CREATABLE_KINDS } from "./kind-labels";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@foundry/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { cn } from "@foundry/ui/cn";

// Shared label tables + typed controls for the discounts sub-pages.
export { KIND_LABELS, ALL_KINDS, CREATABLE_KINDS };

// Keyed by the plan_type enum (type-only import — erased at compile, no drizzle in the
// client bundle) so adding an enum value is a compile error rather than silent drift.
export type PlanType = (typeof planType.enumValues)[number];
const PLAN_LABEL: Record<PlanType, string> = { tiffin: "Tiffin", healthy: "Healthy" };
export const PLAN_TYPES: { value: PlanType; label: string }[] = (
  Object.keys(PLAN_LABEL) as PlanType[]
).map((value) => ({ value, label: PLAN_LABEL[value] }));

export const money = (s: string | null): string => (s == null ? "—" : `$${Number(s).toFixed(2)}`);
export const pct = (s: string | null): string => (s == null ? "—" : `${Number(s)}%`);
export const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

// Coupon windows are entered/displayed in the app-settings timezone (pass useTimezone()), so
// the stored absolute instant is unambiguous regardless of the admin's browser zone (TD-4).

// Short zone name for field labels, e.g. "EDT".
export function tzLabel(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(Date.now())
    .find((p) => p.type === "timeZoneName")?.value ?? tz;
}

// epoch-ms <-> <input type="datetime-local"> value, anchored to `tz` (not the viewer's).
export function toLocalInput(ms: number | null, tz: string): string {
  if (ms == null) return "";
  const wall = ms + tzOffsetMinutes(tz, ms) * 60000;
  return new Date(wall).toISOString().slice(0, 16);
}
export function fromLocalInput(s: string, tz: string): number | null {
  if (!s) return null;
  // Treat the entered wall-clock as `tz`, then convert to the absolute instant.
  const asUtc = new Date(`${s}:00Z`).getTime();
  if (!Number.isFinite(asUtc)) return null;
  return asUtc - tzOffsetMinutes(tz, asUtc) * 60000;
}

// Short date for the coupons-list Window column, in the same zone the editor round-trips.
export function formatWindow(startsAt: number | null, expiresAt: number | null, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, day: "numeric", month: "short", year: "numeric" });
  if (startsAt == null && expiresAt == null) return "Always";
  if (startsAt != null && expiresAt == null) return `From ${fmt.format(startsAt)}`;
  if (startsAt == null && expiresAt != null) return `Until ${fmt.format(expiresAt)}`;
  return `${fmt.format(startsAt as number)} – ${fmt.format(expiresAt as number)}`;
}

export function NumberField({
  id, label, value, onChange, prefix, suffix, min, max, step, placeholder, className, hideLabel,
}: {
  id: string;
  label: string;
  /** Inside a table row the column header already names the field; keep the label for screen readers. */
  hideLabel?: boolean;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm">
            {prefix}
          </span>
        )}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step ?? "any"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("tabular-nums", prefix && "pl-7", suffix && "pr-8")}
        />
        {suffix && (
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export function ToggleRow({
  id, label, hint, checked, onChange, inline, disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  inline?: boolean;
  disabled?: boolean;
}) {
  if (inline) {
    return (
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-muted-foreground text-xs text-pretty">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export function Multiselect({
  options, value, onChange, placeholder, searchPlaceholder, emptyText,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
}) {
  const [open, setOpen] = React.useState(false);
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <li key={v}>
              <Badge
                variant="secondary"
                className="cursor-pointer gap-1 pr-1"
                onClick={() => toggle(v)}
                role="button"
                aria-label={`Remove ${labelOf(v)}`}
              >
                {labelOf(v)}
                <XIcon className="size-3 opacity-70" aria-hidden />
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="text-muted-foreground w-full justify-between font-normal"
          >
            {value.length > 0 ? `${value.length} selected` : placeholder}
            <ChevronsUpDownIcon className="size-4 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-56 p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => {
                  const selected = value.includes(o.value);
                  return (
                    <CommandItem
                      key={o.value}
                      value={o.value}
                      keywords={[o.label]}
                      data-checked={selected}
                      aria-checked={selected}
                      onSelect={() => toggle(o.value)}
                    >
                      {o.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
