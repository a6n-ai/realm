"use client";

import { useRouter } from "next/navigation";
import { AdjustCoinsDialog } from "@foundry/crm";
import { adjustFamilyCoinsAction } from "../../wallet/actions";

export function AdjustCoins({ publicId, balance, who }: { publicId: string; balance: number; who: string }) {
  const router = useRouter();
  return (
    <AdjustCoinsDialog
      balance={balance}
      who={who}
      onSubmit={async (input) => {
        const res = await adjustFamilyCoinsAction(publicId, input);
        if (!res.error) router.refresh();
        return res;
      }}
    />
  );
}
