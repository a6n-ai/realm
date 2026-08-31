"use client";

import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { cn } from "@foundry/ui/cn";

// Shared by the payout grid and the coin-rate form — both are plain
// number-per-row inputs with an optional currency prefix.
export function NumberField({
  id, label, value, onChange, prefix, min, max, step, className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  min?: number;
  max?: number;
  step?: number;
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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("tabular-nums", prefix && "pl-7")}
        />
      </div>
    </div>
  );
}
