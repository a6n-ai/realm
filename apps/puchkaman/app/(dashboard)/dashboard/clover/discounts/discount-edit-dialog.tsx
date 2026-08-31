"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ResponsiveDialog } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { updateDiscountOffer } from "./actions";
import type { DiscountRow } from "@/lib/services/inventory.repository";

// datetime-local inputs read/write local time with no seconds. Date's own
// constructor parses that same string as local time, so this round-trips
// without an explicit timezone conversion.
function epochToLocalInput(ms: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToEpoch(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Edits the local coupon rules layered on a Clover-synced discount: window,
 * minimum spend, and stacking, alongside the existing offer/code fields. The
 * amount and percentage stay read-only — those come from Clover by sync.
 */
export function DiscountEditDialog({
  discount,
  onOpenChange,
}: {
  discount: DiscountRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  // Seeded straight from the row; the caller remounts on a new discount via
  // `key`, so there is no prop-to-state sync effect to keep in step.
  const [publicOffer, setPublicOffer] = useState(discount?.publicOffer ?? false);
  const [couponCode, setCouponCode] = useState(discount?.couponCode ?? "");
  const [startsAt, setStartsAt] = useState(epochToLocalInput(discount?.startsAt ?? null));
  const [expiresAt, setExpiresAt] = useState(epochToLocalInput(discount?.expiresAt ?? null));
  const [minSubtotal, setMinSubtotal] = useState(discount?.minSubtotal ?? "");
  const [stackable, setStackable] = useState(discount?.stackable ?? true);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!discount) return;
    setBusy(true);
    try {
      const res = await updateDiscountOffer({
        publicId: discount.publicId,
        publicOffer,
        couponCode: couponCode.trim() === "" ? null : couponCode.trim(),
        startsAt: localInputToEpoch(startsAt),
        expiresAt: localInputToEpoch(expiresAt),
        minSubtotal: minSubtotal.trim() === "" ? null : Number(minSubtotal),
        stackable,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved");
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save discount");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveDialog
      open={!!discount}
      onOpenChange={onOpenChange}
      title="Edit discount"
      description="The amount still comes from Clover. These rules are local to puchkaman."
      contentClassName="sm:max-w-lg"
    >
      <div className="grid gap-4 px-4 py-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Offer at checkout</p>
            <p className="text-muted-foreground text-xs">
              Lets customers pick this discount without a code.
            </p>
          </div>
          <Switch checked={publicOffer} onCheckedChange={setPublicOffer} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dsc-code">Coupon code</Label>
          <Input
            id="dsc-code"
            value={couponCode}
            placeholder="No code"
            className="font-mono uppercase"
            onChange={(e) => setCouponCode(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dsc-starts">Starts</Label>
            <Input
              id="dsc-starts"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dsc-expires">Expires</Label>
            <Input
              id="dsc-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dsc-min">Minimum spend ($)</Label>
          <Input
            id="dsc-min"
            type="number"
            min={0}
            step="0.01"
            placeholder="No minimum"
            value={minSubtotal}
            onChange={(e) => setMinSubtotal(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Stackable</p>
            <p className="text-muted-foreground text-xs">
              Off means this discount must be used alone — it won&apos;t combine with
              others.
            </p>
          </div>
          <Switch checked={stackable} onCheckedChange={setStackable} />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
