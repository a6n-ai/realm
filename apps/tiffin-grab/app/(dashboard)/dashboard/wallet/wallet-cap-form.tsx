"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@realm/ui/button";
import { NumberField } from "../discounts/controls";
import { setWalletCapAction } from "./coin-rate/actions";

export function WalletCapForm({ current }: { current: number | null }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [cap, setCap] = React.useState(current !== null ? String(current) : "");

  const save = () => {
    const trimmed = cap.trim();
    const n = trimmed === "" ? null : parseInt(trimmed, 10);
    if (n !== null && (!Number.isFinite(n) || n <= 0)) {
      toast.error("Max wallet balance must be a positive integer, or blank for unlimited");
      return;
    }
    start(async () => {
      try {
        await setWalletCapAction({ maxWalletBalance: n });
        toast.success(
          n === null
            ? "Wallet cap cleared — balances are now unlimited"
            : `Wallet cap saved — no wallet can hold more than ${n.toLocaleString()} coins`,
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <SectionCard
      title="Wallet balance cap"
      subtitle="Maximum coins any single customer wallet can hold. New awards that would push a customer over this cap are blocked entirely, not partially applied. Leave blank for unlimited."
    >
      <div className="grid max-w-sm gap-4">
        <NumberField
          id="wallet-cap-value"
          label="Max wallet balance (coins)"
          min={1}
          step={1}
          value={cap}
          onChange={setCap}
          placeholder="Unlimited"
        />
        <Button onClick={save} disabled={pending} className="w-fit">
          Save cap
        </Button>
      </div>
    </SectionCard>
  );
}
