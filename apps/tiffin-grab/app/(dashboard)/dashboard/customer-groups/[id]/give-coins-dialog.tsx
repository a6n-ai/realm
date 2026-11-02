"use client";

import { useState } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { ResponsiveDialog } from "@/components/ds";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { giveGroupCoinsAction } from "../actions";
import { MemberStatuses } from "./member-statuses";

type Outcome = { actionPublicId: string; awarded: number; capped: number };

export function GiveCoinsDialog({
  groupPublicId,
  memberCount,
  open,
  onOpenChange,
  onDone,
}: {
  groupPublicId: string;
  memberCount: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const [coins, setCoins] = useState("0");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const n = Number(coins);
  const valid = Number.isInteger(n) && n >= 1;

  function change(next: boolean) {
    if (submitting) return;
    if (!next) {
      setOutcome(null);
      setFailure(null);
      setMemo("");
      setCoins("0");
    }
    onOpenChange(next);
  }

  async function submit() {
    setSubmitting(true);
    setFailure(null);
    try {
      const res = await giveGroupCoinsAction({ groupPublicId, coins: n, memo: memo || undefined });
      if (res.ok) {
        setOutcome(res.data);
        setCoins("0");
        setMemo("");
        onDone?.();
      } else {
        setFailure(res.error);
      }
    } catch {
      setFailure("The request did not finish.");
    } finally {
      setSubmitting(false);
    }
  }

  const body = outcome ? (
    <div className="flex flex-col gap-3">
      <Alert variant="success">
        <AlertDescription>
          Gave coins to {outcome.awarded} customer{outcome.awarded === 1 ? "" : "s"}
          {outcome.capped > 0 ? `; ${outcome.capped} blocked by the wallet cap` : ""}.
        </AlertDescription>
      </Alert>
      <MemberStatuses actionPublicId={outcome.actionPublicId} />
    </div>
  ) : failure ? (
    <Alert variant="destructive">
      <AlertDescription>
        {failure} Some coins may already have been given. Check the Activity tab before giving again.
      </AlertDescription>
    </Alert>
  ) : (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="group-coins">Coins per customer</Label>
        <Input id="group-coins" inputMode="numeric" value={coins} onChange={(e) => setCoins(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.currentTarget.select()} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="group-coins-memo">Memo (optional)</Label>
        <Input id="group-coins-memo" value={memo} maxLength={200} onChange={(e) => setMemo(e.target.value)} />
      </div>
      <p className="text-sm tabular-nums">
        {memberCount} customers × {valid ? n : 0} coins = {memberCount * (valid ? n : 0)} coins
      </p>
      <p className="text-muted-foreground text-xs">Customers already at the wallet cap are skipped.</p>
    </div>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={change}
      title="Give coins"
      description="Credit every customer in this group."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => change(false)} disabled={submitting}>
            {outcome || failure ? "Close" : "Cancel"}
          </Button>
          {!outcome && !failure && (
            <Button type="button" onClick={submit} disabled={submitting || !valid || memberCount === 0}>
              {submitting ? "Giving coins..." : "Give coins"}
            </Button>
          )}
        </div>
      }
    >
      {body}
    </ResponsiveDialog>
  );
}
