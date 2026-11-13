"use client";

import * as React from "react";
import { ChevronsUpDownIcon, XIcon } from "lucide-react";
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

export const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

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
