"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@foundry/ui/dialog";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { attachReferralCodeAction } from "./wallet-actions";

export function AttachReferral({ customerPublicId }: { customerPublicId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await attachReferralCodeAction(customerPublicId, code);
      if (res.error) return setError(res.error);
      const paid = (res.friend ?? 0) + (res.referrer ?? 0) > 0;
      toast.success(paid ? `Referral added: customer +${res.friend} coins, referrer +${res.referrer} coins` : "Referral added. Coins pay out when their first order is paid.");
      if (res.skipped && res.skipped !== "off") toast.info(`Some coins skipped: ${res.skipped.replace("_", " ")}`);
      setOpen(false);
      setCode("");
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setError(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Add referral code</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add referral code</DialogTitle>
            <DialogDescription>For a customer who forgot their friend&apos;s code. If their first order is already paid, both get their coins now.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="referral-code">Friend&apos;s referral code</Label>
            <Input id="referral-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 7KQ2MX" autoComplete="off" className="font-mono uppercase" aria-invalid={error != null} />
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={pending || code.trim() === ""}>Add referral</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
