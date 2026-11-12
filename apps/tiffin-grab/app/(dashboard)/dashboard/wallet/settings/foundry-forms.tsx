"use client";

import { CoinRateForm, WalletCapForm } from "@foundry/crm";
import { unwrapAction } from "@/lib/actions/unwrap";
import { saveCoinRate, setWalletCapAction } from "./actions";

// The @foundry/crm forms expect onSave to throw; these actions return their refusal instead.
export function CoinRateSettings(props: Omit<Parameters<typeof CoinRateForm>[0], "onSave">) {
  return <CoinRateForm {...props} onSave={async (input) => { await unwrapAction(saveCoinRate(input)); }} />;
}

export function WalletCapSettings(props: Omit<Parameters<typeof WalletCapForm>[0], "onSave">) {
  return <WalletCapForm {...props} onSave={async (input) => { await unwrapAction(setWalletCapAction(input)); }} />;
}
