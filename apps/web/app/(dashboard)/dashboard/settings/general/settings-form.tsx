"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { saveAppSettings } from "./actions";

const ZONES = ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax", "Asia/Kolkata", "UTC"];

const FIELDS = [
  { key: "timezone", label: "App timezone", hint: "Used for all delivery cutoffs and time display." },
  { key: "cutoffHour", label: "Selection cutoff hour (0–23)", hint: "Orders for a day lock at this hour the day before, in the app timezone." },
] as const;

export function SettingsForm({ timezone, cutoffHour }: { timezone: string; cutoffHour: number }) {
  const router = useRouter();
  const [tz, setTz] = useState(timezone);
  const [hour, setHour] = useState(String(cutoffHour));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () => {
    const parsed = parseInt(hour, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 23) {
      setError("Cutoff hour must be 0–23");
      return;
    }
    start(async () => {
      setError(null);
      try {
        await saveAppSettings({ timezone: tz, cutoffHour: parsed });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <div className="grid max-w-md gap-4">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div>
        <Label>{FIELDS[0].label}</Label>
        <Select value={tz} onValueChange={setTz}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{ZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-muted-foreground mt-1 text-xs">{FIELDS[0].hint}</p>
      </div>
      <div>
        <Label>{FIELDS[1].label}</Label>
        <Input type="number" min={0} max={23} step={1} required value={hour} onChange={(e) => setHour(e.target.value)} />
        <p className="text-muted-foreground mt-1 text-xs">{FIELDS[1].hint}</p>
      </div>
      <Button onClick={save} disabled={pending} className="w-fit">Save</Button>
    </div>
  );
}

SettingsForm.Skeleton = function SettingsFormSkeleton() {
  return (
    <div className="grid max-w-md gap-4">
      {FIELDS.map((f) => (
        <div key={f.key}>
          <Label>{f.label}</Label>
          <Skeleton className="mt-1 h-9 w-full" />
          <p className="text-muted-foreground mt-1 text-xs">{f.hint}</p>
        </div>
      ))}
      <Skeleton className="h-9 w-16" />
    </div>
  );
};
