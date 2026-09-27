"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { NumberField } from "../../../discounts/controls";
import { setWalletRedeemCapAction } from "./actions";

export function WalletRedeemCapForm({ current }: { current: number | null }) {
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
        await setWalletRedeemCapAction({ maxCoinRedeemPctOfBalance: n });
        toast.success(
          n === null
            ? "Wallet balance redemption limit cleared"
            : n === 0
              ? "Coins are now switched off at checkout"
              : `Saved — customers can redeem up to ${n}% of their total balance`,
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <SectionCard
      title="Wallet redemption limit"
      subtitle="The maximum percentage of their own wallet balance a customer can redeem in a single order. At 50%, a customer with 1000 coins can only spend 500 at once. Leave blank for no limit."
    >
      <div className="grid max-w-sm gap-4">
        <NumberField
          id="wallet-redeem-pct"
          label="Max share of wallet balance"
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
