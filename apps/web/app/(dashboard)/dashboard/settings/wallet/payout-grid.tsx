"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { NumberField, ToggleRow } from "../discounts/controls";
import { savePayoutRow } from "./actions";

type PayoutRow = {
  eventType: "order_created" | "order_activated" | "order_completed" | "manual_adjustment";
  enabled: boolean;
  coins: number;
};

const EVENT_LABELS: Record<PayoutRow["eventType"], string> = {
  order_created: "Order created",
  order_activated: "Order activated",
  order_completed: "Order completed",
  manual_adjustment: "Manual adjustment",
};

export function PayoutGrid({ payouts }: { payouts: PayoutRow[] }) {
  return (
    <SectionCard
      title="Event payouts"
      subtitle="Configure how many coins customers earn for each business event. Disabled events award no coins."
    >
      {payouts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No payout rows — run db:seed:wallet to seed them.</p>
      ) : (
        <div className="grid gap-3">
          {payouts.map((row) => (
            <PayoutRowItem key={row.eventType} row={row} />
          ))}
        </div>
      )}
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
        toast.success(`${EVENT_LABELS[row.eventType]} saved`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium">{EVENT_LABELS[row.eventType]}</span>
        <ToggleRow
          id={`payout-${row.eventType}-enabled`}
          label="Enabled"
          checked={enabled}
          onChange={setEnabled}
          inline
        />
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
