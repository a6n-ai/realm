"use client";

import { Input } from "@foundry/ui/input";
import type { PriceCell, PriceTable } from "@/lib/pricing/types";

type Props = {
  keys: { key: string; label: string }[];
  value: PriceTable;
  onChange: (t: PriceTable) => void;
  inherited?: PriceTable;
};

const DAYS = [
  ["weekday", "Weekday"],
  ["weekend", "Weekend"],
] as const;

export function PriceTableEditor({ keys, value, onChange, inherited }: Props) {
  const set = (key: string, day: keyof PriceCell, raw: string) => {
    const cell: PriceCell = { ...value[key] };
    if (raw.trim() === "") delete cell[day];
    else cell[day] = Number(raw);
    const next = { ...value };
    if (cell.weekday === undefined && cell.weekend === undefined) delete next[key];
    else next[key] = cell;
    onChange(next);
  };

  return (
    <div className="grid gap-2">
      <div className="text-muted-foreground grid grid-cols-[1fr_8rem_8rem] gap-2 text-xs">
        <span />
        {DAYS.map(([, label]) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {keys.map(({ key, label }) => (
        <div key={key} className="grid grid-cols-[1fr_8rem_8rem] items-center gap-2">
          <span className="text-sm">{label}</span>
          {DAYS.map(([day, dayLabel]) => (
            <Input
              key={day}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              aria-label={`${label} ${dayLabel}`}
              value={value[key]?.[day] ?? ""}
              placeholder={inherited?.[key]?.[day] !== undefined ? String(inherited[key][day]) : ""}
              onChange={(e) => set(key, day, e.target.value)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
