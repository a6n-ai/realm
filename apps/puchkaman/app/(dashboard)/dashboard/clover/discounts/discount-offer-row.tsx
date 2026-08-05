"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@realm/ui/input";
import { Switch } from "@realm/ui/switch";
import { Button } from "@realm/ui/button";
import { updateDiscountOffer } from "./actions";

/**
 * Controls whether customers may claim a Clover discount, and under what code.
 * The amount is never editable here — it lives in Clover and arrives by sync.
 */
export function DiscountOfferControls({
  publicId,
  publicOffer,
  couponCode,
}: {
  publicId: string;
  publicOffer: boolean;
  couponCode: string | null;
}) {
  const [offer, setOffer] = useState(publicOffer);
  const [code, setCode] = useState(couponCode ?? "");
  const [pending, start] = useTransition();

  const dirty = offer !== publicOffer || code !== (couponCode ?? "");

  function save(nextOffer = offer, nextCode = code) {
    start(async () => {
      const res = await updateDiscountOffer({
        publicId,
        publicOffer: nextOffer,
        couponCode: nextCode,
      });
      if ("error" in res) {
        // Put the row back the way the server still sees it.
        setOffer(publicOffer);
        setCode(couponCode ?? "");
        toast.error(res.error);
        return;
      }
      toast.success("Saved");
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Switch
        checked={offer}
        disabled={pending}
        aria-label="Offer to customers at checkout"
        onCheckedChange={(next) => {
          setOffer(next);
          // A toggle that needs a separate Save is a toggle people forget to save.
          save(next, code);
        }}
      />
      <Input
        value={code}
        disabled={pending}
        placeholder="No code"
        aria-label="Coupon code"
        className="h-8 w-36 font-mono text-xs uppercase"
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
      />
      {dirty ? (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => save()}>
          Save
        </Button>
      ) : null}
    </div>
  );
}
