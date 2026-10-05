"use client";

import { useActionState, useState } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { SESSION_CATEGORIES } from "@/db/schema/studio";
import { CATEGORY_LABELS } from "@/lib/sessions/format";
import { createDiscountAction, updateDiscountAction, type DiscountFormState } from "./actions";

export type DiscountFormValues = {
  name: string;
  scope: "all" | "category" | "session";
  category: string;
  sessionPublicId: string;
  valueKind: "percent" | "amount";
  value: string;
  minSubtotal: string;
  startsAt: string;
  endsAt: string;
  stackable: boolean;
  active: boolean;
};

export const EMPTY_DISCOUNT: DiscountFormValues = {
  name: "",
  scope: "all",
  category: "kids",
  sessionPublicId: "",
  valueKind: "percent",
  value: "",
  minSubtotal: "",
  startsAt: "",
  endsAt: "",
  stackable: true,
  active: true,
};

const SCOPE_LABELS: Record<DiscountFormValues["scope"], string> = {
  all: "All classes",
  category: "One category",
  session: "One class",
};

export function DiscountForm({
  publicId,
  initial,
  classes,
  timeZone,
}: {
  publicId?: string;
  initial: DiscountFormValues;
  classes: { publicId: string; title: string }[];
  timeZone: string;
}) {
  const action = publicId ? updateDiscountAction.bind(null, publicId) : createDiscountAction;
  const [state, formAction, pending] = useActionState<DiscountFormState, FormData>(action, {});
  const [scope, setScope] = useState(initial.scope);
  const [category, setCategory] = useState(initial.category);
  const [sessionPublicId, setSessionPublicId] = useState(initial.sessionPublicId);
  const [valueKind, setValueKind] = useState(initial.valueKind);

  return (
    <form action={formAction} className="grid max-w-2xl gap-5">
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required defaultValue={initial.name} placeholder="Kids 10% off" />
        <p className="text-muted-foreground text-xs">Families see this name on their price.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="scope">Applies to</Label>
          <input type="hidden" name="scope" value={scope} />
          <Select value={scope} onValueChange={(v) => setScope(v as DiscountFormValues["scope"])}>
            <SelectTrigger id="scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SCOPE_LABELS) as DiscountFormValues["scope"][]).map((s) => (
                <SelectItem key={s} value={s}>
                  {SCOPE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {scope === "category" ? (
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <input type="hidden" name="category" value={category} />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SESSION_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {scope === "session" ? (
          <div className="grid gap-2">
            <Label htmlFor="sessionPublicId">Class</Label>
            <input type="hidden" name="sessionPublicId" value={sessionPublicId} />
            <Select value={sessionPublicId} onValueChange={setSessionPublicId}>
              <SelectTrigger id="sessionPublicId">
                <SelectValue placeholder="Pick a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.publicId} value={c.publicId}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="valueKind">Type</Label>
          <input type="hidden" name="valueKind" value={valueKind} />
          <Select value={valueKind} onValueChange={(v) => setValueKind(v as DiscountFormValues["valueKind"])}>
            <SelectTrigger id="valueKind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Percent off</SelectItem>
              <SelectItem value="amount">Amount off per booking</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="value">{valueKind === "percent" ? "Percent" : "Amount"}</Label>
          <Input
            id="value"
            name="value"
            type="number"
            min={0}
            max={valueKind === "percent" ? 100 : undefined}
            step="0.01"
            required
            defaultValue={initial.value}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="minSubtotal">Minimum booking total</Label>
        <Input id="minSubtotal" name="minSubtotal" type="number" min={0} step="0.01" defaultValue={initial.minSubtotal} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="startsAt">Starts</Label>
          <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={initial.startsAt} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="endsAt">Ends</Label>
          <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={initial.endsAt} />
        </div>
      </div>
      <p className="text-muted-foreground -mt-3 text-xs">
        Optional. Times are in {timeZone.replaceAll("_", " ")}.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="stackable" defaultChecked={initial.stackable} className="size-4" />
        Can combine with other discounts and coupons
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={initial.active} className="size-4" />
        Active
      </label>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : publicId ? "Save discount" : "Create discount"}
        </Button>
      </div>
    </form>
  );
}
