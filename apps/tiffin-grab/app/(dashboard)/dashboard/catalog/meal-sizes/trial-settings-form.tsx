"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { Skeleton } from "@foundry/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { unwrapAction } from "@/lib/actions/unwrap";
import { trialDaysCap, type TrialSettings } from "@/lib/trial/schedule";
import { saveTrialSettings } from "./actions";

const HINT =
  "A trial rides one delivery frequency: its days are the days a trial can be sent. When creating a trial, staff or the customer pick 1 to max days of them as eating days; one tiffin arrives on each, within one week.";

type Frequency = { key: string; name: string; weekdays: string[] };

const dayName = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);

export function TrialSettingsForm({ value, frequencies }: { value: TrialSettings; frequencies: Frequency[] }) {
  const router = useRouter();
  const [on, setOn] = useState(value.maxDays != null);
  const [frequencyKey, setFrequencyKey] = useState(value.frequencyKey ?? frequencies[0]?.key ?? "");
  const [maxDays, setMaxDays] = useState(value.maxDays ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const frequency = frequencies.find((f) => f.key === frequencyKey);
  const cap = Math.max(trialDaysCap(frequency?.weekdays ?? []), 1);
  // A frequency with fewer days pulls max down with it.
  const max = Math.min(maxDays, cap);
  const counts = Array.from({ length: cap }, (_, i) => i + 1);
  const edit = (fn: () => void) => { setSaved(false); fn(); };

  const save = () =>
    start(async () => {
      setError(null);
      try {
        await unwrapAction(saveTrialSettings(on ? { frequencyKey, maxDays: max } : { frequencyKey: null, maxDays: null }));
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });

  return (
    <div className="grid max-w-lg gap-5">
      <p className="text-muted-foreground text-sm text-pretty">{HINT}</p>
      <Label htmlFor="trial-on" className="flex items-center gap-3 font-normal">
        <Switch id="trial-on" checked={on} onCheckedChange={(v) => edit(() => setOn(v))} />
        Offer trials
      </Label>
      <fieldset disabled={!on} className="grid gap-5 disabled:opacity-50 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-2">
          <Label htmlFor="trial-frequency">Delivery frequency</Label>
          <Select value={frequencyKey} onValueChange={(v) => edit(() => setFrequencyKey(v))}>
            <SelectTrigger id="trial-frequency"><SelectValue placeholder="Pick a frequency" /></SelectTrigger>
            <SelectContent>
              {frequencies.map((f) => <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {frequency && <p className="text-muted-foreground text-xs">Sent {frequency.weekdays.map(dayName).join(" · ")}</p>}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="trial-max">Max days</Label>
          <Select value={String(max)} onValueChange={(v) => edit(() => setMaxDays(Number(v)))}>
            <SelectTrigger id="trial-max" className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {counts.map((n) => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "day" : "days"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </fieldset>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending || (on && !frequency)} className="w-fit">Save</Button>
        {saved && <span className="text-muted-foreground text-sm" aria-live="polite">Saved</span>}
      </div>
    </div>
  );
}

export function TrialSettingsSkeleton() {
  return (
    <div className="grid max-w-lg gap-5">
      <p className="text-muted-foreground text-sm text-pretty">{HINT}</p>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
