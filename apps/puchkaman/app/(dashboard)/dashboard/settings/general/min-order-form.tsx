"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { NumberField } from "../wallet/controls";
import { saveMinOrderValue } from "./actions";

export function MinOrderForm({ current }: { current: number }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [value, setValue] = React.useState(current ? String(current) : "0");

  const save = () => {
    const n = parseFloat(value);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Minimum order value must be 0 or more");
      return;
    }
    start(async () => {
      try {
        await saveMinOrderValue({ minOrderValue: n });
        toast.success(n > 0 ? `Minimum order set to $${n.toFixed(2)}` : "Minimum order removed");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <SectionCard
      title="Minimum order value"
      subtitle="Customers must reach this cart subtotal before checkout is enabled. Set to $0 to turn it off."
    >
      <div className="grid max-w-sm gap-4">
        <NumberField
          id="min-order-value"
          label="Minimum subtotal (CAD)"
          prefix="$"
          min={0}
          step={0.01}
          value={value}
          onChange={setValue}
        />
        <Button onClick={save} disabled={pending} className="w-fit">
          Save
        </Button>
      </div>
    </SectionCard>
  );
}
