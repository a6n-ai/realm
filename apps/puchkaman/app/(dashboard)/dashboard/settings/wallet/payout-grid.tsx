"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { Label } from "@realm/ui/label";
import { Switch } from "@realm/ui/switch";
import type { appEvent } from "@/db/schema";
import { NumberField } from "./controls";
import { savePayoutRow } from "./actions";

type AppEvent = (typeof appEvent.enumValues)[number];

export type PayoutRow = {
  eventType: AppEvent;
  enabled: boolean;
  coins: number;
};

// app_event has no curated payout-event subset — every value the enum
// declares gets a row, so a new event type shows up here automatically
// instead of silently missing until someone remembers to add it.
function eventLabel(e: AppEvent): string {
  return e.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function PayoutGrid({ payouts }: { payouts: PayoutRow[] }) {
  return (
    <SectionCard
      title="Event payouts"
      subtitle="Configure how many coins customers earn for each business event. Disabled events award no coins."
    >
      <div className="grid gap-3">
        {payouts.map((row) => (
          <PayoutRowItem key={row.eventType} row={row} />
        ))}
      </div>
    </SectionCard>
  );
}

function PayoutRowItem({ row }: { row: PayoutRow }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [enabled, setEnabled] = React.useState(row.enabled);
  const [coins, setCoins] = React.useState(String(row.coins));

  const save = () => {
    const n = parseInt(coins, 10);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Coins must be a non-negative integer");
      return;
    }
    start(async () => {
      try {
        await savePayoutRow({ eventType: row.eventType, enabled, coins: n });
        toast.success(`${eventLabel(row.eventType)} saved`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium">{eventLabel(row.eventType)}</span>
        <div className="flex items-center gap-2">
          <Label htmlFor={`payout-${row.eventType}-enabled`} className="text-sm">
            Enabled
          </Label>
          <Switch id={`payout-${row.eventType}-enabled`} checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <NumberField
          id={`payout-${row.eventType}-coins`}
          label="Coins"
          min={0}
          step={1}
          value={coins}
          onChange={setCoins}
          className="w-36"
        />
        <Button onClick={save} disabled={pending} size="sm" variant="outline">
          Save
        </Button>
      </div>
    </div>
  );
}
