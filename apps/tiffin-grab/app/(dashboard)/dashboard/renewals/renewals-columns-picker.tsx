"use client";

import { Columns3Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import {
  DEFAULT_PLAN_TABLE_COLUMNS,
  PLAN_TABLE_COLUMNS,
  type PlanTableColumnKey,
} from "./renewal-table-columns";

export function RenewalsColumnsPicker({
  visible,
  onChange,
}: {
  visible: readonly PlanTableColumnKey[];
  onChange: (next: PlanTableColumnKey[]) => void;
}) {
  const on = new Set(visible);

  function toggle(key: PlanTableColumnKey, checked: boolean) {
    const next = checked ? [...visible, key] : visible.filter((k) => k !== key);
    onChange(next);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-11 gap-1.5 sm:h-9">
          <Columns3Icon className="size-4" />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-64 flex-col gap-3 p-3">
        <p className="text-muted-foreground text-xs">Table columns for Renewals and Trial conversion. Saved in this browser.</p>
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {PLAN_TABLE_COLUMNS.map((c) => {
            const required = "required" in c && c.required;
            return (
              <label key={c.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={on.has(c.key)}
                  disabled={required}
                  onChange={(e) => toggle(c.key, e.target.checked)}
                  className="size-4 shrink-0"
                />
                {c.label}
              </label>
            );
          })}
        </div>
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onChange([...DEFAULT_PLAN_TABLE_COLUMNS])}>
          Reset to default
        </Button>
      </PopoverContent>
    </Popover>
  );
}
