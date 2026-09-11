"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@/components/ds";
import { changePlan } from "./actions";

export type ChangePlanMealSizeOption = { publicId: string; name: string; planKey: string };

/**
 * Admin correction tool: move an order onto a different meal size/plan. Built for
 * the legacy-order migration (docs/realm/legacy-order-migration-plan.md) — orders
 * land on a closest-match meal size at import time, staff use this to fix one up
 * without another migration pass. Price is recomputed server-side in changeMealSize;
 * this control never sends a price, only the target meal size.
 */
export function ChangePlanControl({
  orderId,
  status,
  mealSizeOptions,
}: {
  orderId: string;
  status: string;
  mealSizeOptions: ChangePlanMealSizeOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");

  if (status === "cancelled" || status === "completed") return null;

  const submit = () => {
    if (!selected) return;
    start(async () => {
      await changePlan(orderId, selected);
      setOpen(false);
      setSelected("");
      router.refresh();
    });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="sm" variant="outline" disabled={pending}>
          Change plan
        </Button>
      }
      title="Change this order's plan"
      description="Price is recomputed from the new meal size's current rate — nothing is carried over from the old plan. This does not re-apply any coupon or coin discount the customer originally had."
      footer={
        <div className="flex justify-end gap-2 px-4 pb-2 md:px-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={pending || !selected} onClick={submit}>
            Change plan
          </Button>
        </div>
      }
    >
      <div className="px-4 md:px-0">
        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="" disabled>
            Select a meal size
          </option>
          {mealSizeOptions.map((m) => (
            <option key={m.publicId} value={m.publicId}>
              {m.planKey} — {m.name}
            </option>
          ))}
        </select>
      </div>
    </ResponsiveDialog>
  );
}
