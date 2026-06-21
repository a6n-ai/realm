"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveAppSettings } from "./actions";

const ZONES = ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax", "Asia/Kolkata", "UTC"];

export function SettingsForm({ timezone, cutoffHour }: { timezone: string; cutoffHour: number }) {
  const router = useRouter();
  const [tz, setTz] = useState(timezone);
  const [hour, setHour] = useState(String(cutoffHour));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      try {
        await saveAppSettings({ timezone: tz, cutoffHour: Number(hour) });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });

  return (
    <div className="grid max-w-md gap-4">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div>
        <Label>App timezone</Label>
        <Select value={tz} onValueChange={setTz}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{ZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-muted-foreground mt-1 text-xs">Used for all delivery cutoffs and time display.</p>
      </div>
      <div>
        <Label>Selection cutoff hour (0–23)</Label>
        <Input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(e.target.value)} />
        <p className="text-muted-foreground mt-1 text-xs">Orders for a day lock at this hour the day before, in the app timezone.</p>
      </div>
      <Button onClick={save} disabled={pending} className="w-fit">Save</Button>
    </div>
  );
}
