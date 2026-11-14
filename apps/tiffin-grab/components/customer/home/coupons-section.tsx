"use client";

import Link from "next/link";
import { TicketPercentIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, EmptyState, Skeleton, buttonClass } from "@/components/customer/kit";
import { useAppCurrency } from "@/components/app-currency";
import { formatDiscount } from "@/lib/format/currency";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import type { AvailableCoupon } from "@/lib/coupons/coupons.service";

// Discount pill text — distinct from the admin table's couponValue() (which reads
// "20%"/"$5.00"): the customer pill reads as a benefit ("20% off"/"$5 off").
export function discountLine(c: Pick<AvailableCoupon, "kind" | "valuePct" | "valueAmount">, currency: string): string {
  switch (c.kind) {
    case "percentage":
      return formatDiscount({ valuePct: c.valuePct }, currency);
    case "fixed":
      return formatDiscount({ valueAmount: c.valueAmount }, currency);
    case "first_order":
      return formatDiscount(c, currency);
    case "free_delivery":
      return "Free delivery";
    case "rep_daily":
    case "rep_code":
      return "Special offer"; // never listed (rep-owned, hidden); kept for exhaustiveness
  }
}

const METHOD_LABELS: Record<string, string> = { stripe: "Card", etransfer: "Interac e-Transfer", cash: "Cash" };

function CouponCard({ coupon }: { coupon: AvailableCoupon }) {
  const tz = useTimezone();
  const currency = useAppCurrency();
  const methods = coupon.allowedPaymentMethods.map((m) => METHOD_LABELS[m] ?? m).join(", ");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      toast(`Copied ${coupon.code}`);
    } catch {
      toast(`Couldn't copy. The code is ${coupon.code}`);
    }
  };
  return (
    <div className="flex flex-col gap-3 c-surface rounded-2xl bg-(--primary-wash) p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold tracking-[0.04em]">{coupon.code}</p>
          <p className="mt-0.5 text-sm text-pretty">{coupon.name}</p>
        </div>
        <p className="text-primary nums shrink-0 text-base font-semibold">{discountLine(coupon, currency)}</p>
      </div>
      {coupon.description && <p className="c-caption text-pretty">{coupon.description}</p>}
      {(coupon.expiresAt != null || methods) && (
        <p className="c-caption">
          {[
            coupon.expiresAt != null ? `Expires ${formatEpoch(coupon.expiresAt, { mode: "date", timeZone: tz })}` : null,
            methods ? `Pay with ${methods}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4">
        <Button variant="outline" className="min-h-11" onClick={copy}>Copy code</Button>
        <Link href="/me/renew" className="text-primary inline-flex min-h-11 items-center text-subhead font-semibold underline underline-offset-2">
          Use at checkout
        </Link>
      </div>
    </div>
  );
}

export function CouponsSection({ coupons }: { coupons: AvailableCoupon[] }) {
  return (
    <section aria-labelledby="available-coupons" className="space-y-3">
      <h2 id="available-coupons" className="c-h2">Available coupons</h2>
      {coupons.length === 0 ? (
        <EmptyState
          icon={<TicketPercentIcon className="size-6" />}
          title="No coupons right now"
          body="Codes show up here while they're live."
          action={<Link href="/me/renew" className={buttonClass({ variant: "outline" })}>Renew plan</Link>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {coupons.map((coupon) => (
            <CouponCard key={coupon.code} coupon={coupon} />
          ))}
        </div>
      )}
    </section>
  );
}

// Named skeleton twin: a Server Component cannot dot into this "use client"
// module's export (the /dashboard/orders bug).
export function CouponsSectionSkeleton() {
  return (
    <section className="space-y-3">
      <h2 className="c-h2">Available coupons</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-40 rounded-3xl" />
      </div>
    </section>
  );
}
