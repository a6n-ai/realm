"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Input } from "@foundry/ui/input";
import { Skeleton } from "@foundry/ui/skeleton";
import { saveTiffinsPerWeek } from "./actions";

const HINT = "Fewest and most eating days (tiffins) a customer can pick per week. Independent of delivery frequency.";

export function TiffinsPerWeekForm({ min, max }: { min: number; max: number }) {
  const router = useRouter();
  const [lo, setLo] = useState(String(min));
  const [hi, setHi] = useState(String(max));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      try {
        await saveTiffinsPerWeek({ minTiffinsPerWeek: Number(lo), maxTiffinsPerWeek: Number(hi) });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });

  return (
    <div className="grid max-w-md gap-4">
      <p className="text-muted-foreground text-xs">{HINT}</p>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div>
        <Label>Min</Label>
        <Input type="number" min={1} max={7} step={1} value={lo} onChange={(e) => setLo(e.target.value)} />
      </div>
      <div>
        <Label>Max</Label>
        <Input type="number" min={1} max={7} step={1} value={hi} onChange={(e) => setHi(e.target.value)} />
      </div>
      <Button onClick={save} disabled={pending} className="w-fit">Save</Button>
    </div>
  );
}

export function TiffinsPerWeekSkeleton() {
  return (
    <div className="grid max-w-md gap-4">
      <p className="text-muted-foreground text-xs">{HINT}</p>
      {["Min", "Max"].map((l) => (
        <div key={l}>
          <Label>{l}</Label>
          <Skeleton className="mt-1 h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-16" />
    </div>
  );
}
