"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { CURRENCIES } from "@/lib/app-clock";
import { saveAppClock } from "./actions";

const ZONES = [
  "Asia/Singapore",
  "Asia/Kolkata",
  "America/Toronto",
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Halifax",
  "Australia/Sydney",
  "UTC",
];

export function SettingsForm({ timezone, currency }: { timezone: string; currency: string }) {
  const router = useRouter();
  const [tz, setTz] = useState(timezone);
  const [ccy, setCcy] = useState(currency);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      try {
        await saveAppClock({ timezone: tz, currency: ccy });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });

  const zones = ZONES.includes(timezone) ? ZONES : [timezone, ...ZONES];

  return (
    <div className="grid max-w-md gap-4">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div>
        <Label>App timezone</Label>
        <Select value={tz} onValueChange={setTz}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {zones.map((z) => (
              <SelectItem key={z} value={z}>
                {z.replaceAll("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground mt-1 text-xs">
          Wall-clock for classes, What&apos;s on, and the console. The database stays UTC.
        </p>
      </div>
      <div>
        <Label>Currency</Label>
        <Select value={ccy} onValueChange={setCcy}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground mt-1 text-xs">All booking amounts are captured and shown in this currency.</p>
      </div>
      <Button onClick={save} disabled={pending} className="w-fit">
        Save
      </Button>
    </div>
  );
}
