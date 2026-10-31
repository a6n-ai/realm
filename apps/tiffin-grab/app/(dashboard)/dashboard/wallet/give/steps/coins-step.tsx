"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircleIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Textarea } from "@foundry/ui/textarea";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { NumberField } from "../../../discounts/controls";
import { createCoinGrantAction } from "../../actions";

export function CoinsStep({
  count,
  name,
  onNameChange,
  coins,
  onCoinsChange,
  filters,
  userPublicIds,
  onBack,
  onSaved,
}: {
  count: number;
  name: string;
  onNameChange: (v: string) => void;
  coins: string;
  onCoinsChange: (v: string) => void;
  filters: Record<string, unknown>;
  userPublicIds: string[];
  onBack: () => void;
  onSaved: (r: { publicId: string; listError: string | null }) => void;
}) {
  const router = useRouter();
  const [memo, setMemo] = React.useState("");
  const [saving, startSave] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const n = parseInt(coins, 10);
  const each = n > 0 ? n : 0;
  const valid = Number.isInteger(n) && n > 0 && name.trim().length > 0;

  const save = () => {
    setError(null);
    startSave(async () => {
      try {
        const r = await createCoinGrantAction({
          name: name.trim(),
          filters,
          userPublicIds,
          coins: n,
          memo: memo.trim() || undefined,
        });
        // Reset so a stray keystroke on the next grant replaces the value instead of appending to a stale
        // number - that is how 20 real customers once got 155 coins instead of 5.
        onCoinsChange("0");
        toast.success(`${r.awarded} awarded${r.capped ? `, ${r.capped} blocked by the wallet cap` : ""}`);
        router.refresh();
        onSaved({ publicId: r.publicId, listError: r.listError });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not save the grant";
        setError(msg);
        toast.error(msg);
      }
    });
  };

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="grant-name">Group name</Label>
        <Input id="grant-name" value={name} onChange={(e) => onNameChange(e.target.value)} maxLength={120} />
      </div>
      <NumberField id="grant-coins" label="Coins each" min={0} step={1} value={coins} onChange={onCoinsChange} className="w-40" />
      <div className="grid gap-1.5">
        <Label htmlFor="grant-memo">Memo (optional)</Label>
        <Textarea id="grant-memo" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} rows={2} />
      </div>
      <p className="text-sm font-medium tabular-nums">
        {count} customer{count === 1 ? "" : "s"} × {each} coins = {count * each} coins
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>
              {error} Check <Link href="/dashboard/wallet/groups" className="underline">Wallet → Groups</Link> before saving again.
            </span>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} disabled={saving}>Back</Button>
        <Button onClick={save} disabled={saving || !valid}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
