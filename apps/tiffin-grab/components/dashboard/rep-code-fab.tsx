"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, TicketPercentIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import { issueRepCode, repCodeAllowance, type RepCodeAllowance } from "@/app/(dashboard)/dashboard/discounts/rep-code-actions";

// Floating on every dashboard page: a staff member issues a one-off discount code on their
// own allowance while talking to a customer. Limits are enforced by the server action.
export function RepCodeFab() {
  const tz = useTimezone();
  const [open, setOpen] = useState(false);
  const [allowance, setAllowance] = useState<RepCodeAllowance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ code: string; amount: number; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const show = async () => {
    setOpen(true);
    setIssued(null);
    setAmount("");
    setNote("");
    setError(null);
    const r = await repCodeAllowance().catch(() => ({ error: "Couldn't load your allowance. Try again." }));
    if ("error" in r) setError(r.error);
    else setAllowance(r.allowance);
  };

  const generate = async () => {
    const value = Number(amount);
    setBusy(true);
    setError(null);
    const r = await issueRepCode(value, note.trim() || undefined).catch(() => ({ error: "Couldn't create the code. Try again." }));
    setBusy(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
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

  const value = Number(amount);
  const valid = allowance != null && value > 0 && value <= allowance.capAmount && allowance.left > 0;

  return (
    <>
      <Button
        type="button"
        onClick={() => void show()}
        className="fixed right-4 bottom-24 z-40 h-12 rounded-full px-5 shadow-lg md:right-6 md:bottom-6"
      >
        <TicketPercentIcon className="size-4" /> Create coupon
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{issued ? "Coupon created" : "Create a coupon"}</DialogTitle>
            <DialogDescription>
              {issued
                ? "Give this code to the customer. It works once, on top of any other coupon."
                : "A one-off code on your account for one customer."}
            </DialogDescription>
          </DialogHeader>
          {issued ? (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span className="nums text-xl font-semibold tracking-wider select-all">{issued.code}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
                  {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />} {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-muted-foreground text-sm">
                <span className="nums">${issued.amount.toFixed(2)}</span> off · valid until{" "}
                {formatEpoch(issued.expiresAt, { mode: "datetime", timeZone: tz })}
              </p>
              {allowance && <p className="text-muted-foreground nums text-xs">{allowance.left} of {allowance.total} left today</p>}
              <Button type="button" variant="outline" disabled={!allowance || allowance.left <= 0} onClick={() => { setIssued(null); setAmount(""); setNote(""); }}>
                Create another
              </Button>
            </div>
          ) : (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (valid && !busy) void generate(); }}>
              <div className="grid gap-1.5">
                <Label htmlFor="rep-code-amount">Amount off ($)</Label>
                <Input
                  id="rep-code-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={allowance?.capAmount}
                  step={0.01}
                  autoFocus
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                {allowance && (
                  <p className="text-muted-foreground nums text-xs">
                    Up to ${allowance.capAmount.toFixed(2)}, and no more than {allowance.capPct}% of the order · {allowance.left} of {allowance.total} left today
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rep-code-note">Customer or reason (optional)</Label>
                <Input id="rep-code-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
              <Button type="submit" disabled={!valid || busy}>{busy ? "Creating…" : "Generate code"}</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
