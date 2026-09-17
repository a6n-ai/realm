"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { NumberField } from "../../../discounts/controls";
import { setCoinCapAction } from "./actions";

export function CoinCapForm({ current }: { current: number | null }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [pct, setPct] = React.useState(current !== null ? String(current) : "");

  const save = () => {
    const trimmed = pct.trim();
    const n = trimmed === "" ? null : Number(trimmed);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 100)) {
      toast.error("Enter a whole percent from 0 to 100, or leave blank for no limit");
      return;
    }
    start(async () => {
      try {
        await setCoinCapAction({ maxCoinPct: n });
        toast.success(
          n === null
            ? "Coin limit cleared — coins can cover a whole order"
            : n === 0
              ? "Coins are now switched off at checkout"
              : `Saved — coins can cover up to ${n}% of an order's subtotal`,
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <SectionCard
      title="Coin spending limit"
      subtitle="The most of an order's subtotal (before tax) a customer can pay with coins. At 30%, a $100 order accepts up to $30 of coins. Customers see the limit at checkout. Leave blank for no limit; 0 turns coin spending off."
    >
      <div className="grid max-w-sm gap-4">
        <NumberField
          id="coin-cap-pct"
          label="Max share of subtotal"
          suffix="%"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={setPct}
          placeholder="No limit"
        />
        <Button onClick={save} disabled={pending} className="w-fit">
          Save limit
        </Button>
      </div>
    </SectionCard>
  );
}
