"use client";

import { TicketPercentIcon } from "lucide-react";
import { Badge } from "@realm/ui/badge";
import { Skeleton } from "@realm/ui/skeleton";
import { Card, EmptyState, SectionCard } from "@/components/ds";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import { KIND_LABELS } from "@/app/(dashboard)/dashboard/discounts/kind-labels";
import type { AvailableCoupon } from "@/lib/services/coupons.service";

// Discount pill text — distinct from the admin table's couponValue() (which reads
// "20%"/"$5.00"): the customer pill reads as a benefit ("20% off"/"$5 off").
function discountLine(c: AvailableCoupon): string {
  switch (c.kind) {
    case "percentage":
      return `${Number(c.valuePct)}% off`;
    case "fixed":
      return `$${Number(c.valueAmount)} off`;
    case "first_order":
      return c.valuePct != null ? `${Number(c.valuePct)}% off` : `$${Number(c.valueAmount)} off`;
    case "free_delivery":
      return "Free delivery";
    case "rep_daily":
      return "Special offer"; // excluded by listAvailable(); kept for exhaustiveness
  }
}

function CouponCard({ coupon }: { coupon: AvailableCoupon }) {
  const tz = useTimezone();
  return (
    <Card variant="flat" className="space-y-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
            <TicketPercentIcon className="text-primary size-4.5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-wide">{coupon.code}</p>
            <p className="text-muted-foreground text-xs">{KIND_LABELS[coupon.kind]}</p>
          </div>
        </div>
        <Badge variant="secondary" className="text-sm font-semibold">
          {discountLine(coupon)}
        </Badge>
      </div>
      <p className="text-sm font-medium text-pretty">{coupon.name}</p>
      {coupon.description && <p className="text-muted-foreground text-xs text-pretty">{coupon.description}</p>}
      {coupon.expiresAt != null && (
        <p className="text-muted-foreground text-xs">
          Expires {formatEpoch(coupon.expiresAt, { mode: "date", timeZone: tz })}
        </p>
      )}
    </Card>
  );
}

export function CouponsSection({ coupons }: { coupons: AvailableCoupon[] }) {
  return (
    <SectionCard title="Available coupons" subtitle="Codes you can apply at checkout while they're live.">
      {coupons.length === 0 ? (
        <EmptyState icon={TicketPercentIcon} message="No coupons available right now." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {coupons.map((coupon) => (
            <CouponCard key={coupon.code} coupon={coupon} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// Named skeleton twin — a Server Component cannot dot into this "use client"
// module's export (the /dashboard/orders bug).
export function CouponsSectionSkeleton() {
  return (
    <SectionCard title="Available coupons" subtitle="Codes you can apply at checkout while they're live.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    </SectionCard>
  );
}
