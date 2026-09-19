"use client";

import { useActionState } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { claimPaymentAction, type ClaimState } from "./actions";

export function ClaimForm({ publicId }: { publicId: string }) {
  const action = claimPaymentAction.bind(null, publicId);
  const [state, formAction, pending] = useActionState<ClaimState, FormData>(action, {});

  return (
    <form action={formAction} className="grid max-w-md gap-3">
      <div className="grid gap-2">
        <Label htmlFor="reference">Transfer reference</Label>
        <Input id="reference" name="reference" required placeholder="Interac confirmation" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "I've paid"}
      </Button>
      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}
      {state.ok ? <p className="text-sm">Thanks — we'll confirm this shortly.</p> : null}
    </form>
  );
}
