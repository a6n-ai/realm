import { EXPIRY_PRESETS } from "@foundry/collab/limits";
import { Input } from "@foundry/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { toDateInput } from "../../lib/dates";
import type { ExpiryChoice } from "./expiry";

const DATE = "date";
export const presetLabel = (seconds: number) => EXPIRY_PRESETS.find((p) => p.seconds === seconds)?.label ?? `${seconds} seconds`;

export function ExpirySelect({ value, onChange }: { value: ExpiryChoice; onChange: (value: ExpiryChoice) => void }) {
  const selected = "preset" in value ? String(value.preset) : DATE;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={selected} onValueChange={(v) => v && onChange(v === DATE ? { date: "" } : { preset: Number(v) })}>
        <SelectTrigger aria-label="Link expiry" className="min-w-32">
          <SelectValue>{"preset" in value ? presetLabel(value.preset) : "Pick a date"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {EXPIRY_PRESETS.map((p) => (
            <SelectItem key={p.seconds} value={String(p.seconds)}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value={DATE}>Pick a date</SelectItem>
        </SelectContent>
      </Select>
      {"date" in value ? (
        <Input
          type="date"
          aria-label="Expiry date"
          className="w-40"
          min={toDateInput(Date.now())}
          value={value.date}
          onChange={(e) => onChange({ date: e.target.value })}
        />
      ) : null}
    </div>
  );
}
