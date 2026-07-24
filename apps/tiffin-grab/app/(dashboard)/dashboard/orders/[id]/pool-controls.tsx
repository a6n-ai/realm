"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import type { TiffinCounts } from "@/lib/services/customer-deliveries.service";
import { scheduleFromPoolAction } from "./actions";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// delivery_date is a calendar date; parse as UTC so the weekday never shifts across timezones.
function isoWeekdayKey(iso: string): string {
  return WEEKDAY_KEYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/**
 * Staff view of a subscription's tiffin ledger + the same "schedule from pool" action the customer
 * has. Only days strictly after the last delivery on a plan weekday are accepted; the server
 * re-validates in scheduleFromPool.
 */
export function PoolControls({ orderId, counts }: { orderId: string; counts: TiffinCounts }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [pending, start] = useTransition();

  const weekdays = new Set(counts.deliveryWeekdays);
  const last = counts.lastDeliveryDate;
  const dateValid =
    !!date && (!last || date > last) && weekdays.has(isoWeekdayKey(date));

  function schedule() {
    if (!dateValid) return;
    start(async () => {
      try {
        await scheduleFromPoolAction(orderId, date);
        setDate("");
        router.refresh();
        toast("Tiffin scheduled");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not schedule that day");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total" value={counts.total} />
        <Stat label="Delivered" value={counts.delivered} />
        <Stat label="Remaining" value={counts.remaining} />
        <Stat label="To schedule" value={counts.pooled} />
      </div>

      {counts.pooled > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">
            Schedule a pooled tiffin
            {last ? ` after ${last}` : ""} on a plan day ({counts.deliveryWeekdays.join(", ")}):
          </span>
          <input
            type="date"
            value={date}
            min={last ?? undefined}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border bg-transparent px-2 py-1 text-sm"
          />
          <Button size="sm" disabled={pending || !dateValid} onClick={schedule}>
            Schedule tiffin
          </Button>
          {date && !dateValid && (
            <span className="text-bad text-xs">Pick a plan weekday after the last delivery.</span>
          )}
        </div>
      )}
    </div>
  );
}
