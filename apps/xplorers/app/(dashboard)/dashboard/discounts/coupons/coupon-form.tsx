"use client";

import { useActionState, useState } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { createCouponAction, updateCouponAction, type CouponFormState } from "./actions";

export type CouponFormValues = {
  code: string;
  name: string;
  valueKind: "percent" | "amount";
  value: string;
  minSubtotal: string;
  maxRedemptions: string;
  maxPerUser: string;
  allowedPaymentMethods: string[];
  startsAt: string;
  expiresAt: string;
  stackable: boolean;
  active: boolean;
  redemptionCount?: number;
};

export const EMPTY_COUPON: CouponFormValues = {
  code: "",
  name: "",
  valueKind: "percent",
  value: "",
  minSubtotal: "",
  maxRedemptions: "",
  maxPerUser: "1",
  allowedPaymentMethods: [],
  startsAt: "",
  expiresAt: "",
  stackable: false,
  active: true,
};

export function CouponForm({
  publicId,
  initial,
  methods,
  timeZone,
}: {
  publicId?: string;
  initial: CouponFormValues;
  methods: { id: string; label: string }[];
  timeZone: string;
}) {
  const action = publicId ? updateCouponAction.bind(null, publicId) : createCouponAction;
  const [state, formAction, pending] = useActionState<CouponFormState, FormData>(action, {});
  const [valueKind, setValueKind] = useState(initial.valueKind);

  return (
    <form action={formAction} className="grid max-w-2xl gap-5">
      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      {initial.redemptionCount != null ? (
        <p className="text-muted-foreground text-sm">Used {initial.redemptionCount} times.</p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            name="code"
            required
            defaultValue={initial.code}
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono uppercase"
            placeholder="SUMMER10"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required defaultValue={initial.name} placeholder="Summer 10% off" />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="valueKind">Type</Label>
          <input type="hidden" name="valueKind" value={valueKind} />
          <Select value={valueKind} onValueChange={(v) => setValueKind(v as CouponFormValues["valueKind"])}>
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
      <div className="grid gap-2 sm:grid-cols-3 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="minSubtotal">Minimum booking total</Label>
          <Input id="minSubtotal" name="minSubtotal" type="number" min={0} step="0.01" defaultValue={initial.minSubtotal} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="maxRedemptions">Total uses</Label>
          <Input
            id="maxRedemptions"
            name="maxRedemptions"
            type="number"
            min={1}
            step="1"
            defaultValue={initial.maxRedemptions}
            placeholder="Unlimited"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="maxPerUser">Uses per family</Label>
          <Input
            id="maxPerUser"
            name="maxPerUser"
            type="number"
            min={1}
            step="1"
            defaultValue={initial.maxPerUser}
            placeholder="Unlimited"
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="startsAt">Starts</Label>
          <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={initial.startsAt} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="expiresAt">Expires</Label>
          <Input id="expiresAt" name="expiresAt" type="datetime-local" defaultValue={initial.expiresAt} />
        </div>
      </div>
      <p className="text-muted-foreground -mt-3 text-xs">Optional. Times are in {timeZone.replaceAll("_", " ")}.</p>
      {methods.length ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Payment methods</legend>
          <p className="text-muted-foreground text-xs">Leave all unticked to allow every method.</p>
          {methods.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="allowedPaymentMethods"
                value={m.id}
                defaultChecked={initial.allowedPaymentMethods.includes(m.id)}
                className="size-4"
              />
              {m.label}
            </label>
          ))}
        </fieldset>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="stackable" defaultChecked={initial.stackable} className="size-4" />
        Can combine with automatic discounts
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={initial.active} className="size-4" />
        Active
      </label>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : publicId ? "Save coupon" : "Create coupon"}
        </Button>
      </div>
    </form>
  );
}
