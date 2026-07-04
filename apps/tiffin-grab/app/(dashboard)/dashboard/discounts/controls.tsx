"use client";

import * as React from "react";
import { ChevronsUpDownIcon, XIcon } from "lucide-react";
import { tzOffsetMinutes } from "@realm/commons";
import type { CouponKind } from "@/db/schema/coupons";
import type { planType } from "@/db/schema/catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Shared label tables + typed controls for the discounts sub-pages. Kept out of
// the server schema so no drizzle code is pulled into the client bundle (the enum
// types are erased at compile).
export const KIND_LABELS: Record<CouponKind, string> = {
  percentage: "Percentage off",
  fixed: "Fixed amount off",
  free_delivery: "Free delivery",
  first_order: "First order",
  rep_daily: "Rep daily",
};
export const ALL_KINDS = Object.keys(KIND_LABELS) as CouponKind[];
export const CREATABLE_KINDS = ALL_KINDS.filter((k) => k !== "rep_daily");

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

// Coupon windows are entered/displayed in a fixed business zone (staff are IST) so the
// stored absolute instant is unambiguous regardless of the admin's browser zone (TD-4).
export const BUSINESS_TZ = "Asia/Kolkata";
export const BUSINESS_TZ_LABEL = "IST";

// epoch-ms <-> <input type="datetime-local"> value, anchored to BUSINESS_TZ (not the viewer's).
export function toLocalInput(ms: number | null): string {
  if (ms == null) return "";
  const wall = ms + tzOffsetMinutes(BUSINESS_TZ, ms) * 60000;
  return new Date(wall).toISOString().slice(0, 16);
}
export function fromLocalInput(s: string): number | null {
  if (!s) return null;
  // Treat the entered wall-clock as BUSINESS_TZ, then convert to the absolute instant.
  const asUtc = new Date(`${s}:00Z`).getTime();
  if (!Number.isFinite(asUtc)) return null;
  return asUtc - tzOffsetMinutes(BUSINESS_TZ, asUtc) * 60000;
}

// Short IST date for the coupons-list Window column. Anchored to BUSINESS_TZ so the
// label matches the values the editor's datetime-local pickers round-trip.
const windowFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});
export function formatWindow(startsAt: number | null, expiresAt: number | null): string {
  if (startsAt == null && expiresAt == null) return "Always";
  if (startsAt != null && expiresAt == null) return `From ${windowFmt.format(startsAt)}`;
  if (startsAt == null && expiresAt != null) return `Until ${windowFmt.format(expiresAt)}`;
  return `${windowFmt.format(startsAt as number)} – ${windowFmt.format(expiresAt as number)}`;
}

export function NumberField({
  id, label, value, onChange, prefix, suffix, min, max, step, placeholder, className,
}: {
  id: string;
  label: string;
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
      <Label htmlFor={id}>{label}</Label>
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
  id, label, hint, checked, onChange, inline,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-muted-foreground text-xs text-pretty">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
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
