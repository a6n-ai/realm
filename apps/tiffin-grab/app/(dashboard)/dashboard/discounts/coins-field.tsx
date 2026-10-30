"use client";

import { useEffect, useState } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import type { StaffCoinPreview } from "../inquiries/[id]/order/actions";

// The matched customer's wallet. An estimate starts on every coin the order allows; a staff order
// starts on none (`onOrder`). The server clamps whatever is typed to the order's maximum.
export function CoinsField({ coins, setCoins, onOrder = false }: { coins: StaffCoinPreview; setCoins: (coins: number | "max") => void; onOrder?: boolean }) {
  const [draft, setDraft] = useState(String(coins.used));
  useEffect(() => setDraft(String(coins.used)), [coins.used]);
  const submit = () => {
    const n = Number(draft);
    if (Number.isInteger(n) && n >= 0) setCoins(n);
    else setDraft(String(coins.used));
  };

  return (
    <section className="grid gap-3">
      <Label htmlFor="estimate-coins">Coins</Label>
      {coins.balance > 0 ? (
        <div className="grid gap-2">
          <div className="flex gap-2">
            <Input
              id="estimate-coins"
              type="number"
              inputMode="numeric"
              min={0}
              max={coins.maxCoins}
              step={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
            <Button type="button" variant="outline" disabled={coins.maxCoins <= 0} onClick={() => setCoins("max")}>Max</Button>
            {onOrder && coins.used > 0 && <Button type="button" variant="ghost" onClick={() => setCoins(0)}>Clear</Button>}
          </div>
          <p className="text-muted-foreground text-xs tabular-nums">
            {coins.balance} in wallet · up to {coins.maxCoins} on this order
            {coins.used > 0 ? ` · ${coins.used} used, −$${coins.value.toFixed(2)}` : onOrder ? " · none used unless you add them" : ""}
          </p>
          {coins.message && <p className="text-muted-foreground text-xs">{coins.message}</p>}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No coins in this customer&apos;s wallet.</p>
      )}
    </section>
  );
}
