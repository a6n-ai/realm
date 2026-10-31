"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { ResponsiveDialog } from "@/components/ds";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { applyGroupCouponAction, listGroupableCouponsAction } from "../actions";

type Coupon = { publicId: string; code: string; name: string };

export function ApplyDiscountDialog({
  groupPublicId,
  open,
  onOpenChange,
  onDone,
}: {
  groupPublicId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setCoupons(null);
    setLoadError(null);
    try {
      const res = await listGroupableCouponsAction();
      if (res.ok) setCoupons(res.data);
      else setLoadError(res.error);
    } catch {
      setLoadError("Could not load coupons.");
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function change(next: boolean) {
    if (submitting) return;
    if (!next) {
      setPicked(null);
      setError(null);
    }
    onOpenChange(next);
  }

  async function submit() {
    if (!picked) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await applyGroupCouponAction(groupPublicId, picked);
      if (res.ok) {
        onDone?.();
        change(false);
      } else setError(res.error);
    } catch {
      setError("The request did not finish.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={change}
      title="Apply discount"
      description="Limit an existing coupon to this group. Only its members can use it."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => change(false)} disabled={submitting}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={submitting || !picked}>
            {submitting ? "Applying..." : "Apply discount"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-2">
              {loadError}
              <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
            </AlertDescription>
          </Alert>
        ) : !coupons ? (
          <Skeleton className="h-32 w-full" />
        ) : coupons.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground text-sm">No coupons are free to limit to a group. Auto-apply, staff and already-grouped coupons are left out.</p>
            <Button asChild variant="outline"><Link href="/dashboard/discounts/coupons">Create coupon</Link></Button>
          </div>
        ) : (
          <>
            <div className="max-h-72 overflow-y-auto rounded-lg border" role="radiogroup" aria-label="Coupon">
              {coupons.map((c) => (
                <label key={c.publicId} className="hover:bg-muted flex cursor-pointer items-center gap-3 border-b p-3 text-sm transition-colors last:border-b-0">
                  <input type="radio" name="coupon" className="size-4 shrink-0" checked={picked === c.publicId} onChange={() => setPicked(c.publicId)} />
                  <span className="font-medium">{c.code}</span>
                  <span className="text-muted-foreground truncate">{c.name}</span>
                </label>
              ))}
            </div>
            <Link href="/dashboard/discounts/coupons" className="text-sm underline">Create coupon</Link>
          </>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </ResponsiveDialog>
  );
}
