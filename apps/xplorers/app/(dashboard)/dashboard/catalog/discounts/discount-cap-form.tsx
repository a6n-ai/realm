"use client";

import { useActionState } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { setDiscountCapAction, type CapState } from "./actions";

export function DiscountCapForm({ value, canEdit }: { value: number; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState<CapState, FormData>(setDiscountCapAction, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="maxDiscountPct">Max % off per booking</Label>
        <Input
          id="maxDiscountPct"
          name="maxDiscountPct"
          type="number"
          min={0}
          max={100}
          step="1"
          defaultValue={value}
          disabled={!canEdit}
          className="w-32"
        />
      </div>
      {canEdit ? (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-muted-foreground text-sm">Saved.</p> : null}
    </form>
  );
}
