"use client";

import { Button } from "@foundry/ui/button";
import { DateInput } from "@/components/dashboard/date-fields";
import { followUpAtDate, followUpPick } from "./follow-up-picks";

export type PickKey = "tomorrow" | "3d" | "1w" | "date";
export type FollowUpValue = { key: PickKey; at: number; iso?: string };

const PICKS: { key: Exclude<PickKey, "date">; label: string }[] = [
  { key: "tomorrow", label: "Tomorrow" },
  { key: "3d", label: "3 days" },
  { key: "1w", label: "1 week" },
];

export function FollowUpPicker({
  timeZone, value, onChange,
}: {
  timeZone: string;
  value: FollowUpValue | null;
  onChange: (v: FollowUpValue | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Next follow-up</span>
      <div className="flex flex-wrap items-center gap-2">
        {PICKS.map((p) => (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant={value?.key === p.key ? "default" : "outline"}
            onClick={() => onChange(value?.key === p.key ? null : { key: p.key, at: followUpPick(p.key, Date.now(), timeZone) })}
          >
            {p.label}
          </Button>
        ))}
        <DateInput
          value={value?.key === "date" ? (value.iso ?? "") : ""}
          onChange={(iso) => onChange({ key: "date", iso, at: followUpAtDate(iso, timeZone) })}
          placeholder="Pick date"
          aria-label="Pick follow-up date"
        />
      </div>
    </div>
  );
}
