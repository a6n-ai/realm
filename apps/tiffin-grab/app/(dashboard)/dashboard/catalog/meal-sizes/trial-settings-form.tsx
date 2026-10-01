"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Skeleton } from "@foundry/ui/skeleton";
import { saveTrialSettings } from "./actions";

const DAYS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
] as const;

const HINT = "Maximum days a trial can run (up to 5, within one week) and the weekdays it can be sent on. When creating a trial, pick which of those days it arrives; one tiffin is delivered each day.";

export function TrialSettingsForm({ maxDays, weekdays }: { maxDays: number | null; weekdays: string[] }) {
  const router = useRouter();
  const [max, setMax] = useState(maxDays == null ? "" : String(maxDays));
  const [days, setDays] = useState<string[]>(weekdays);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (day: string) => setDays((cur) => (cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day]));

  const save = () =>
    start(async () => {
      setError(null);
      try {
        const trimmed = max.trim();
        await saveTrialSettings({ maxDays: trimmed === "" ? null : Number(trimmed), weekdays: days });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });

  return (
    <div className="grid max-w-lg gap-4">
      <p className="text-muted-foreground text-xs">{HINT}</p>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div>
        <Label htmlFor="trial-max">Maximum days</Label>
        <Input id="trial-max" type="number" min={1} max={5} step={1} value={max} onChange={(e) => setMax(e.target.value)} className="mt-1 max-w-32" />
      </div>
      <div>
        <Label>Send days</Label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DAYS.map(([key, label]) => {
            const on = days.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(key)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${on ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <Button onClick={save} disabled={pending} className="w-fit">Save</Button>
    </div>
  );
}

export function TrialSettingsSkeleton() {
  return (
    <div className="grid max-w-lg gap-4">
      <p className="text-muted-foreground text-xs">{HINT}</p>
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
