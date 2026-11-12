"use client";

import { AdjustCoinsDialog } from "@foundry/crm";
import { adjustCustomerCoinsAction } from "./wallet-actions";

export function AdjustCoins({ customerPublicId, balance, who }: { customerPublicId: string; balance: number; who: string }) {
  return (
    <AdjustCoinsDialog balance={balance} who={who} onSubmit={async (input) => {
        const res = await adjustCustomerCoinsAction(customerPublicId, input);
        return "error" in res ? { error: res.error } : {};
      }} />
  );
}
