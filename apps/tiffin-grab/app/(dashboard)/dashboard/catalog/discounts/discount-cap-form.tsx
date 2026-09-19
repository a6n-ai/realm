"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Input } from "@foundry/ui/input";
import { Skeleton } from "@foundry/ui/skeleton";
import { saveDiscountCap } from "./actions";

const HINT = "Total of all catalog discounts a customer can receive is capped at this % of the tiffin subtotal.";

export function DiscountCapForm({ value }: { value: number }) {
  const router = useRouter();
  const [pct, setPct] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      try {
        await saveDiscountCap({ maxDiscountPct: Number(pct) });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });

  return (
    <div className="grid max-w-md gap-3">
      <p className="text-muted-foreground text-xs">{HINT}</p>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex items-end gap-2">
        <div className="w-28">
          <Label>Cap (%)</Label>
          <Input type="number" min={0} max={100} step={1} value={pct} onChange={(e) => setPct(e.target.value)} />
        </div>
        <Button onClick={save} disabled={pending}>Save</Button>
      </div>
    </div>
  );
}

export function DiscountCapSkeleton() {
  return (
    <div className="grid max-w-md gap-3">
      <p className="text-muted-foreground text-xs">{HINT}</p>
      <div className="flex items-end gap-2">
        <div className="w-28">
          <Label>Cap (%)</Label>
          <Skeleton className="mt-1 h-9 w-full" />
        </div>
        <Skeleton className="h-9 w-16" />
      </div>
    </div>
  );
}
