"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { NumberField } from "../../discounts/controls";
import { setCoinEarnPctAction } from "./actions";

export function EarnPctForm({ current }: { current: number }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [pct, setPct] = React.useState(String(current));

  const save = () => {
    const n = Number(pct.trim());
    if (pct.trim() === "" || !Number.isInteger(n) || n < 0 || n > 100) {
      toast.error("Enter a whole percent from 0 to 100");
      return;
    }
    start(async () => {
      try {
        await setCoinEarnPctAction({ pct: n });
        toast.success(n === 0 ? "Coin earning is off" : `Saved — paid orders earn ${n}% back as coins`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <SectionCard
      title="Earn back"
      subtitle="Share of each paid order (before tax) returned to the customer as coins, at the coin value above. At 10% and $0.10 a coin, a $200 order earns 200 coins. 0 turns earning off."
    >
      <div className="grid max-w-sm gap-4">
        <NumberField
          id="coin-earn-pct"
          label="Earn rate"
          suffix="%"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={setPct}
          placeholder="0"
        />
        <Button onClick={save} disabled={pending} className="w-fit">
          Save earn rate
        </Button>
      </div>
    </SectionCard>
  );
}
