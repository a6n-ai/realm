"use client";

import * as React from "react";
import { AdjustCoinsDialog } from "@foundry/crm";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { adjustFamilyCoinsAction, familyBalanceAction } from "../actions";

export function AdjustFamily({ families }: { families: { publicId: string; label: string }[] }) {
  const [picked, setPicked] = React.useState("");
  const [balance, setBalance] = React.useState<number | null>(null);
  const family = families.find((f) => f.publicId === picked);

  const pick = (publicId: string) => {
    setPicked(publicId);
    setBalance(null);
    void familyBalanceAction(publicId).then(setBalance);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="wallet-family">Family</Label>
        <Select value={picked} onValueChange={pick}>
          <SelectTrigger id="wallet-family" className="w-72">
            <SelectValue placeholder="Pick a family" />
          </SelectTrigger>
          <SelectContent>
            {families.map((f) => (
              <SelectItem key={f.publicId} value={f.publicId}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {family && balance !== null ? (
        <AdjustCoinsDialog
          balance={balance}
          who={family.label}
          onSubmit={async (input) => {
            const res = await adjustFamilyCoinsAction(family.publicId, input);
            if (!res.error) setBalance(await familyBalanceAction(family.publicId));
            return res;
          }}
        />
      ) : null}
    </div>
  );
}
