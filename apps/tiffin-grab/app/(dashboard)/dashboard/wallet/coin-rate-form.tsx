"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberField } from "../discounts/controls";
import { saveCoinRate } from "./actions";

type CurrentRate = { currency: string; valuePerCoin: string } | null;

export function CoinRateForm({ current }: { current: CurrentRate }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [valuePerCoin, setValuePerCoin] = React.useState(
    current ? String(Number(current.valuePerCoin)) : "0.1",
  );

  const save = () => {
    const n = parseFloat(valuePerCoin);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Value per coin must be a positive number");
      return;
    }
    start(async () => {
      try {
        await saveCoinRate({ currency: "CAD", valuePerCoin: n });
        toast.success("Coin rate saved — new rate is now active");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <SectionCard
      title="Coin rate"
      subtitle="Sets the CAD value of one coin. Each save creates a versioned rate record; historical rates are preserved."
    >
      <div className="grid max-w-sm gap-4">
        <div className="grid gap-1.5">
          <Label>Currency</Label>
          <p className="text-sm font-medium">CAD</p>
        </div>
        <NumberField
          id="coin-rate-value"
          label="Value per coin (CAD)"
          prefix="$"
          min={0.0001}
          step={0.001}
          value={valuePerCoin}
          onChange={setValuePerCoin}
        />
        {current && (
          <p className="text-muted-foreground text-xs">
            Current rate: ${Number(current.valuePerCoin).toFixed(4)} {current.currency}
          </p>
        )}
        <Button onClick={save} disabled={pending} className="w-fit">
          Save rate
        </Button>
      </div>
    </SectionCard>
  );
}
