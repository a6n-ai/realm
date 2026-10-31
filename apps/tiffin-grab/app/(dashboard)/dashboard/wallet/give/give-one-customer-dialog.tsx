"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { ResponsiveDialog } from "@/components/ds";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { AccountSearch, type AccountResult } from "../../customer-groups/new/account-search";
import { broadcastCustomerPayout, type CustomerBroadcastResult } from "../actions";

export function GiveOneCustomerDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<AccountResult | null>(null);
  const [coins, setCoins] = useState("0");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<CustomerBroadcastResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const n = Number(coins);
  const valid = Number.isInteger(n) && n >= 1;

  function change(next: boolean) {
    if (submitting) return;
    setOpen(next);
    if (!next) {
      setAccount(null);
      setOutcome(null);
      setFailure(null);
      setMemo("");
      setCoins("0");
    }
  }

  async function submit() {
    if (!account || !valid || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      setOutcome(await broadcastCustomerPayout({ userPublicIds: [account.publicId], coins: n, memo: memo || undefined }));
      setCoins("0");
      setMemo("");
      router.refresh();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The request did not finish.");
    } finally {
      setSubmitting(false);
    }
  }

  const name = account?.fullName ?? "Customer";
  const body = outcome ? (
    <Alert variant={outcome.awarded > 0 ? "success" : "warning"}>
      <AlertDescription>
        {outcome.awarded > 0 ? `Gave ${outcome.coinsPerCustomer} coins to ${name}.` : `${name} is at the wallet cap, so no coins were given.`}
      </AlertDescription>
    </Alert>
  ) : failure ? (
    <Alert variant="destructive">
      <AlertDescription>{failure} Check the grants below before giving again.</AlertDescription>
    </Alert>
  ) : (
    <div className="flex flex-col gap-4">
      {account ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
          <span className="font-medium">{name}</span>
          <span className="text-muted-foreground flex items-center gap-2">
            {account.phone ?? account.email}
            <Button type="button" size="sm" variant="ghost" onClick={() => setAccount(null)}>Change</Button>
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label>Customer</Label>
          <AccountSearch placeholder="Name, phone or email" onPick={setAccount} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="one-coins">Coins</Label>
        <Input id="one-coins" inputMode="numeric" value={coins} onChange={(e) => setCoins(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.currentTarget.select()} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="one-coins-memo">Memo (optional)</Label>
        <Input id="one-coins-memo" value={memo} maxLength={200} onChange={(e) => setMemo(e.target.value)} />
      </div>
      <p className="text-sm tabular-nums">1 customer × {valid ? n : 0} coins = {valid ? n : 0} coins</p>
      <p className="text-muted-foreground text-xs">A customer already at the wallet cap is skipped.</p>
    </div>
  );

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <UserIcon /> One customer
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={change}
        title="Give coins to one customer"
        description="Search a customer and credit them directly. No group is created."
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => change(false)} disabled={submitting}>
              {outcome || failure ? "Close" : "Cancel"}
            </Button>
            {!outcome && !failure && (
              <Button type="button" onClick={() => void submit()} disabled={submitting || !valid || !account}>
                {submitting ? "Giving coins..." : "Give coins"}
              </Button>
            )}
          </div>
        }
      >
        {body}
      </ResponsiveDialog>
    </>
  );
}
