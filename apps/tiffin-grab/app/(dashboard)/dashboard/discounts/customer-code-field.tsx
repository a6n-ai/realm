"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@foundry/ui/card";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import { issueRepCode, repCodeAllowance, type RepCodeAllowance } from "./rep-code-actions";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Issues a one-off code on the rep's own allowance, capped against this order, and applies it to
// the estimate so the total shown is what the customer pays after entering it at checkout.
/** `onOrder`: staff create the order themselves, so the code is redeemed on it, not typed at checkout. */
export function CustomerCodeField({ subtotal, apply, note, onOrder = false }: { subtotal: number; apply?: (code: string) => void; note: string; onOrder?: boolean }) {
  const tz = useTimezone();
  const [allowance, setAllowance] = useState<RepCodeAllowance | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ code: string; amount: number; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    repCodeAllowance()
      .then((r) => ("error" in r ? setError(r.error) : setAllowance(r.allowance)))
      .catch(() => setError("Couldn't load your allowance"));
  }, []);

  // A new customer remounts the form: put the issued code back on it. applyCoupon ignores a repeat.
  useEffect(() => {
    if (issued && apply) apply(issued.code);
  }, [issued, apply]);

  // The server caps the code at redeem time too; this keeps the quoted total honest.
  const ceiling = allowance ? round2(Math.min(allowance.capAmount, (subtotal * allowance.capPct) / 100)) : 0;
  const value = Number(amount);
  const valid = allowance != null && allowance.left > 0 && value > 0 && value <= ceiling;

  const generate = async () => {
    setBusy(true);
    setError(null);
    const r = await issueRepCode(value, note).catch(() => ({ error: "Couldn't create the code. Try again." }));
    setBusy(false);
    if ("error" in r) return setError(r.error);
    setAllowance(r.allowance);
    setIssued({ code: r.code, amount: value, expiresAt: r.expiresAt });
    setCopied(false);
  };

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy. Select the code and copy it by hand.");
    }
  };

  if (!allowance && !error) return null;

  return (
    <section className="grid gap-3">
      <Label htmlFor="estimate-code-amount">{onOrder ? "Staff discount" : "Customer code"}</Label>
      {issued ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="tabular-nums tracking-wider select-all">{issued.code}</CardTitle>
            <CardDescription className="tabular-nums">
              ${issued.amount.toFixed(2)} off until {formatEpoch(issued.expiresAt, { mode: "datetime", timeZone: tz })}. {onOrder ? "Applied to this order." : "Included in the price; the customer enters it at checkout."}
            </CardDescription>
            <CardAction>
              <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
                {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />} {copied ? "Copied" : "Copy"}
              </Button>
            </CardAction>
          </CardHeader>
        </Card>
      ) : allowance ? (
        <div className="grid gap-2">
          <div className="flex gap-2">
            <Input
              id="estimate-code-amount"
              type="number"
              inputMode="decimal"
              min={0}
              max={ceiling}
              step={0.01}
              placeholder="Amount off"
              disabled={subtotal <= 0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && valid && !busy) void generate(); }}
            />
            <Button type="button" variant="outline" disabled={ceiling <= 0} onClick={() => setAmount(String(ceiling))}>Max</Button>
          </div>
          <p className="text-muted-foreground text-xs tabular-nums">
            {subtotal > 0 ? `Up to $${ceiling.toFixed(2)} on this order` : "Price the order first"} · {allowance.left} of {allowance.total} left today
          </p>
          <Button type="button" variant="outline" disabled={!valid || busy} onClick={() => void generate()}>
            {busy ? "Creating…" : "Generate code"}
          </Button>
        </div>
      ) : null}
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    </section>
  );
}
