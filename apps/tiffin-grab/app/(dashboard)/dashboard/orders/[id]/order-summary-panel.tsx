import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney as fmt } from "@realm/commons";
import { OrderStatusBadge } from "@/components/ds";
import { Invoice } from "@/components/wizard/invoice";
import { formatEpoch } from "@/lib/format/datetime";
import type { OrderPricingSnapshot } from "@/lib/pricing/types";
import type { OrderDetail } from "@/lib/services/orders.service";

function isPricingSnapshot(value: unknown): value is OrderPricingSnapshot {
  if (typeof value !== "object" || value == null) return false;
  return "subtotal" in value && "total" in value && Array.isArray((value as OrderPricingSnapshot).lineItems);
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-muted-foreground text-xs sm:text-sm">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function OrderSummaryPanel({
  order,
  customer,
  timezone,
  currency,
  categoryLabels,
}: {
  order: OrderDetail;
  customer: { publicId: string } | null;
  timezone: string;
  currency: string;
  categoryLabels: Record<string, string>;
}) {
  const snap = order.pricingSnapshot;
  const categoryEntries = Object.entries(order.categoryCounts).filter(([, qty]) => qty > 0);
  const weekend =
    [order.includeSaturday && "Sat", order.includeSunday && "Sun"].filter(Boolean).join(", ") || "None";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <OrderStatusBadge status={order.status} />
        {customer && (
          <Link
            href={`/dashboard/customers/${customer.publicId}`}
            className="text-primary text-sm underline-offset-2 hover:underline"
          >
            Customer profile
          </Link>
        )}
      </div>

      <dl className="space-y-2.5">
        <DetailRow label="Plan">
          {order.planName}
          {order.mealSizeName ? ` · ${order.mealSizeName}` : ""}
        </DetailRow>
        <DetailRow label="Schedule">
          Starts {order.startDate} · {order.durationWeeks} weeks · {order.frequencyKey} ·{" "}
          {order.persons} person{order.persons === 1 ? "" : "s"}
        </DetailRow>
        <DetailRow label="Meals">{order.mealSlots.join(", ")}</DetailRow>
        <DetailRow label="Weekends">{weekend}</DetailRow>
        {categoryEntries.length > 0 && (
          <DetailRow label="Items">
            {categoryEntries
              .map(([key, qty]) => `${qty}× ${categoryLabels[key] ?? key}`)
              .join(", ")}
          </DetailRow>
        )}
        <DetailRow label="Tiffins">
          {order.tiffinCount} total
          {order.pooledTiffinCount > 0 ? ` · ${order.pooledTiffinCount} in pool` : ""}
        </DetailRow>
        <DetailRow label="Address">
          {order.fullName}
          <br />
          {order.addressLine}, {order.city} {order.postalCode}
        </DetailRow>
        <DetailRow label="Order ID">
          <span className="font-mono text-xs">{order.publicId}</span>
        </DetailRow>
        <DetailRow label="Deployment">
          <span className="font-mono text-xs">{order.deploymentId}</span>
        </DetailRow>
        <DetailRow label="Created">
          {formatEpoch(order.createdAt, { mode: "datetime", timeZone: timezone })}
        </DetailRow>
      </dl>

      <div className="space-y-2">
        <p className="text-sm font-medium">Pricing</p>
        {isPricingSnapshot(snap) ? (
          <Invoice result={snap} />
        ) : (
          <div className="rounded-lg border p-4 text-sm">
            <div className="flex justify-between gap-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{fmt(Number(order.total), currency)}</span>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {order.tiffinCount} tiffins × {fmt(Number(order.perTiffinPrice), currency)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
