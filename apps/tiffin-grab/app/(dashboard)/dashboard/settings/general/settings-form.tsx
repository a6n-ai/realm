"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@realm/ui/button";
import { Label } from "@realm/ui/label";
import { Input } from "@realm/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import { Skeleton } from "@realm/ui/skeleton";
import { saveAppSettings } from "./actions";

const ZONES = ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax", "Asia/Kolkata", "UTC"];
const CURRENCIES = ["INR", "USD", "AED", "GBP", "EUR"];
const COUNTRIES: { code: string; name: string }[] = [
  { code: "CA", name: "Canada" },
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
];
const AUTO = "auto"; // Select needs a non-empty value; maps to null (derive from timezone).

const FIELDS = [
  { key: "timezone", label: "App timezone", hint: "Used for all delivery cutoffs and time display." },
  { key: "cutoffHour", label: "Selection cutoff hour (0–23)", hint: "Orders for a day lock at this hour the day before, in the app timezone." },
  { key: "currency", label: "Currency", hint: "Currency all amounts are captured and displayed in." },
  { key: "defaultCountry", label: "Default phone country", hint: "Country pre-selected in every phone-number input." },
] as const;

// Blank = unlimited (null); a package-level limit (Task 7) overrides these when set.
const PAUSE_FIELDS = [
  { key: "defaultMaxPauses", label: "Default max pauses", hint: "Max pauses per subscription when the duration package doesn't set its own limit. Blank = unlimited." },
  { key: "defaultMaxPauseDaysTotal", label: "Default max pause days (total)", hint: "Total paused days allowed across a subscription. Blank = unlimited." },
  { key: "defaultMaxPauseStretchDays", label: "Default max pause stretch (days)", hint: "Longest single pause allowed. Blank = unlimited." },
] as const;

function toNullableInt(v: string): number | null {
  if (v.trim() === "") return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

export function SettingsForm({
  timezone, cutoffHour, currency, defaultCountry, autoCountry,
  defaultMaxPauses, defaultMaxPauseDaysTotal, defaultMaxPauseStretchDays,
}: {
  timezone: string; cutoffHour: number; currency: string; defaultCountry: string | null; autoCountry: string;
  defaultMaxPauses: number | null; defaultMaxPauseDaysTotal: number | null; defaultMaxPauseStretchDays: number | null;
}) {
  const router = useRouter();
  const [tz, setTz] = useState(timezone);
  const [hour, setHour] = useState(String(cutoffHour));
  const [ccy, setCcy] = useState(currency);
  const [country, setCountry] = useState(defaultCountry ?? AUTO);
  const [maxPauses, setMaxPauses] = useState(defaultMaxPauses == null ? "" : String(defaultMaxPauses));
  const [maxPauseDaysTotal, setMaxPauseDaysTotal] = useState(defaultMaxPauseDaysTotal == null ? "" : String(defaultMaxPauseDaysTotal));
  const [maxPauseStretchDays, setMaxPauseStretchDays] = useState(defaultMaxPauseStretchDays == null ? "" : String(defaultMaxPauseStretchDays));
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
        await saveAppSettings({
          timezone: tz,
          cutoffHour: parsed,
          currency: ccy,
          defaultCountry: country === AUTO ? null : country,
          defaultMaxPauses: toNullableInt(maxPauses),
          defaultMaxPauseDaysTotal: toNullableInt(maxPauseDaysTotal),
          defaultMaxPauseStretchDays: toNullableInt(maxPauseStretchDays),
        });
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
      <div>
        <Label>{FIELDS[2].label}</Label>
        <Select value={ccy} onValueChange={setCcy}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-muted-foreground mt-1 text-xs">{FIELDS[2].hint}</p>
      </div>
      <div>
        <Label>{FIELDS[3].label}</Label>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO}>Auto (from timezone — {autoCountry})</SelectItem>
            {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground mt-1 text-xs">{FIELDS[3].hint}</p>
      </div>
      <div>
        <Label>{PAUSE_FIELDS[0].label}</Label>
        <Input type="number" min={0} step={1} value={maxPauses} onChange={(e) => setMaxPauses(e.target.value)} placeholder="Unlimited" />
        <p className="text-muted-foreground mt-1 text-xs">{PAUSE_FIELDS[0].hint}</p>
      </div>
      <div>
        <Label>{PAUSE_FIELDS[1].label}</Label>
        <Input type="number" min={0} step={1} value={maxPauseDaysTotal} onChange={(e) => setMaxPauseDaysTotal(e.target.value)} placeholder="Unlimited" />
        <p className="text-muted-foreground mt-1 text-xs">{PAUSE_FIELDS[1].hint}</p>
      </div>
      <div>
        <Label>{PAUSE_FIELDS[2].label}</Label>
        <Input type="number" min={0} step={1} value={maxPauseStretchDays} onChange={(e) => setMaxPauseStretchDays(e.target.value)} placeholder="Unlimited" />
        <p className="text-muted-foreground mt-1 text-xs">{PAUSE_FIELDS[2].hint}</p>
      </div>
      <Button onClick={save} disabled={pending} className="w-fit">Save</Button>
    </div>
  );
}

export function SettingsFormSkeleton() {
  return (
    <div className="grid max-w-md gap-4">
      {[...FIELDS, ...PAUSE_FIELDS].map((f) => (
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
