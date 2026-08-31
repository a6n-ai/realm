"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import type { AwardableEvent } from "@/lib/services/wallet.service";
import { NumberField } from "./controls";
import { savePayoutRow } from "./actions";

export type PayoutRow = {
  eventType: AwardableEvent;
  enabled: boolean;
  coins: number;
};

// Only events with a real award call site get a row (see AWARDABLE_EVENTS in
// lib/services/wallet.service.ts). Rendering the whole app_event enum sold
// switches that did nothing when flipped.
function eventLabel(e: AwardableEvent): string {
  return e.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function PayoutGrid({
  payouts,
  hasCoinRate,
}: {
  payouts: PayoutRow[];
  hasCoinRate: boolean;
}) {
  return (
    <SectionCard
      title="Event payouts"
      subtitle="Configure how many coins customers earn for each business event. Disabled events award no coins."
    >
      {!hasCoinRate && (
        <p className="border-destructive/40 bg-destructive/10 text-destructive mb-3 rounded-lg border p-3 text-sm">
          Set a coin rate below before enabling a payout. Without one, customers
          earn coins they cannot spend — checkout rejects the redemption.
        </p>
      )}
      <div className="grid gap-3">
        {payouts.map((row) => (
          <PayoutRowItem key={row.eventType} row={row} hasCoinRate={hasCoinRate} />
        ))}
      </div>
    </SectionCard>
  );
}

function PayoutRowItem({ row, hasCoinRate }: { row: PayoutRow; hasCoinRate: boolean }) {
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
          <Switch
            id={`payout-${row.eventType}-enabled`}
            checked={enabled}
            disabled={!hasCoinRate && !row.enabled}
            onCheckedChange={setEnabled}
          />
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
