"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { NumberField, ToggleRow } from "../discounts/controls";
import type { appEvent } from "@/db/schema";
import { savePayoutRow } from "./actions";

const CARD_TITLE = "Event payouts";
const CARD_SUBTITLE =
  "Configure how many coins customers earn for each business event. Disabled events award no coins.";

type AppEvent = (typeof appEvent.enumValues)[number];

type PayoutRow = {
  eventType: AppEvent;
  enabled: boolean;
  coins: number;
};

const EVENT_LABELS: Partial<Record<AppEvent, string>> = {
  order_created: "Order created",
  order_activated: "Order activated",
  order_completed: "Order completed",
  manual_adjustment: "Manual adjustment",
};

/** Fallback label for events without a curated name: "order_cancelled" → "Order cancelled". */
function eventLabel(e: AppEvent): string {
  return EVENT_LABELS[e] ?? e.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function PayoutGrid({ payouts }: { payouts: PayoutRow[] }) {
  return (
    <SectionCard title={CARD_TITLE} subtitle={CARD_SUBTITLE}>
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

// Single source of truth for a payout row's layout: the real row and the skeleton
// twin both render through this shell, so the loading state can't drift from it.
function PayoutRowShell({
  label,
  toggle,
  field,
  action,
}: {
  label: React.ReactNode;
  toggle: React.ReactNode;
  field: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {label}
        {toggle}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {field}
        {action}
      </div>
    </div>
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
    <PayoutRowShell
      label={<span className="text-sm font-medium">{eventLabel(row.eventType)}</span>}
      toggle={
        <ToggleRow
          id={`payout-${row.eventType}-enabled`}
          label="Enabled"
          checked={enabled}
          onChange={setEnabled}
          inline
        />
      }
      field={
        <NumberField
          id={`payout-${row.eventType}-coins`}
          label="Coins"
          min={0}
          step={1}
          value={coins}
          onChange={setCoins}
          className="w-36"
        />
      }
      action={
        <Button onClick={save} disabled={pending} size="sm" variant="outline">
          Save
        </Button>
      }
    />
  );
}

// Exact loading twin: same SectionCard copy + same PayoutRowShell layout, grey
// blocks where each control's label/input/switch/button go. Rendered as the
// page's <Suspense fallback> so it always mirrors PayoutGrid by construction.
PayoutGrid.Skeleton = function PayoutGridSkeleton() {
  return (
    <SectionCard title={CARD_TITLE} subtitle={CARD_SUBTITLE}>
      <div className="grid gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <PayoutRowShell
            key={i}
            label={<Skeleton className="h-4 w-32" />}
            toggle={
              <div className="flex items-center gap-2">
                <Label className="text-sm">Enabled</Label>
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            }
            field={
              <div className="grid w-36 gap-1.5">
                <Label>Coins</Label>
                <Skeleton className="h-9 w-full" />
              </div>
            }
            action={<Skeleton className="h-8 w-16" />}
          />
        ))}
      </div>
    </SectionCard>
  );
};
