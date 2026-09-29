import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney as fmt } from "@foundry/commons";
import { SectionCard } from "@/components/ds";
import { OrderPricingBreakdown } from "./order-pricing-breakdown";
import { formatEpoch } from "@/lib/format/datetime";
import type { OrderPricingSnapshot } from "@/lib/pricing/types";
import { orderDeliveryDays, planWeek, type DayOfWeek } from "@/lib/menu/delivery-days";
import type { OrderDetail } from "@/lib/services/orders.service";

function isPricingSnapshot(value: unknown): value is OrderPricingSnapshot {
  if (typeof value !== "object" || value == null) return false;
  return "subtotal" in value && "total" in value && Array.isArray((value as OrderPricingSnapshot).lineItems);
}

// Both overview cards use this one row shape so their label columns line up side by side.
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 border-b py-2.5 first:pt-0 last:border-0 last:pb-0 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  );
}

const cap = (d: string) => d[0].toUpperCase() + d.slice(1);
const dash = <span className="text-muted-foreground">—</span>;

export type OverviewCustomer = {
  publicId: string;
  name: string | null;
  email: string;
  phone: string | null;
} | null;

export function OrderOverview({
  order,
  customer,
  zoneName,
  timezone,
  currency,
  categoryLabels,
}: {
  order: OrderDetail;
  customer: OverviewCustomer;
  zoneName: string | null;
  timezone: string;
  currency: string;
  categoryLabels: Record<string, string>;
}) {
  const snap = order.pricingSnapshot;
  const categoryEntries = Object.entries(order.categoryCounts).filter(([, qty]) => qty > 0);
  const eatingDays = order.eatingDays as DayOfWeek[] | null;
  const deliveryDays = orderDeliveryDays({
    frequencyKey: order.frequencyKey,
    weekdays: order.frequencyWeekdays as DayOfWeek[] | null,
    includeSaturday: eatingDays ? false : order.includeSaturday,
    includeSunday: eatingDays ? false : order.includeSunday,
  });
  const trips = eatingDays ? planWeek(deliveryDays, eatingDays) : null;
  const details = isPricingSnapshot(snap) ? deliveryDetails(snap.deliveryCharge) : "";

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Plan & schedule">
          <dl>
            <DetailRow label="Plan">{order.planName}</DetailRow>
            <DetailRow label="Meal size">{order.mealSizeName}</DetailRow>
            <DetailRow label="Items">
              {categoryEntries.length > 0
                ? categoryEntries.map(([key, qty]) => `${qty}× ${categoryLabels[key] ?? key}`).join(", ")
                : dash}
            </DetailRow>
            <DetailRow label="Persons">{order.persons}</DetailRow>
            <DetailRow label="Meal slots">{order.mealSlots.map((m) => cap(m.replaceAll("_", " "))).join(", ")}</DetailRow>
            <DetailRow label="Frequency">{order.frequencyName}</DetailRow>
            <DetailRow label="Delivery days">{deliveryDays.map(cap).join(", ")}</DetailRow>
            <DetailRow label="Eating days">{(eatingDays ?? deliveryDays).map(cap).join(", ")}</DetailRow>
            {/* A trip is one truck run. Only worth a row when a run carries more than one eating day. */}
            {trips?.some((t) => t.units > 1) && (
              <DetailRow label="Combined trips">
                {trips.filter((t) => t.units > 1).map((t) => `${cap(t.day)} brings ${t.days.map(cap).join(" + ")}`).join(" · ")}
              </DetailRow>
            )}
            <DetailRow label="Start">
              {order.startDate} · {order.durationWeeks} week{order.durationWeeks === 1 ? "" : "s"}
            </DetailRow>
            <DetailRow label="Tiffins">
              <span className="tabular-nums">
                {order.tiffinCount} total
                {order.pooledTiffinCount > 0 ? ` · ${order.pooledTiffinCount} in pool` : ""}
              </span>
            </DetailRow>
          </dl>
        </SectionCard>

        <SectionCard
          title="Customer & delivery"
          action={
            customer ? (
              <Link
                href={`/dashboard/customers/${customer.publicId}`}
                className="text-primary text-sm underline-offset-2 hover:underline"
              >
                Customer profile
              </Link>
            ) : undefined
          }
        >
          <dl>
            <DetailRow label="Name">{order.fullName}</DetailRow>
            <DetailRow label="Email">
              {customer?.email ? <a className="hover:underline" href={`mailto:${customer.email}`}>{customer.email}</a> : dash}
            </DetailRow>
            <DetailRow label="Phone">
              {customer?.phone ? <a className="tabular-nums hover:underline" href={`tel:${customer.phone}`}>{customer.phone}</a> : dash}
            </DetailRow>
            <DetailRow label="Address">
              {order.addressLine}
              {order.addressUnit ? `, Unit ${order.addressUnit}` : ""}
              <br />
              {order.city} {order.postalCode}
            </DetailRow>
            <DetailRow label="Zone">{zoneName ?? dash}</DetailRow>
            <DetailRow label="Drop-off">{details || dash}</DetailRow>
            <DetailRow label="Instructions">{order.deliveryInstructions || dash}</DetailRow>
            <DetailRow label="Order ref">
              <span className="font-mono text-xs">{order.deploymentId}</span>
            </DetailRow>
            <DetailRow label="Internal ID">
              <span className="text-muted-foreground font-mono text-xs">{order.publicId}</span>
            </DetailRow>
            <DetailRow label="Created">{formatEpoch(order.createdAt, { mode: "datetime", timeZone: timezone })}</DetailRow>
            <DetailRow label="Updated">{formatEpoch(order.updatedAt, { mode: "datetime", timeZone: timezone })}</DetailRow>
          </dl>
        </SectionCard>
      </div>

      <SectionCard title="Pricing" subtitle="Snapshot taken at checkout. Totals are computed server-side.">
        {isPricingSnapshot(snap) ? (
          <OrderPricingBreakdown result={snap} currency={currency} />
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
      </SectionCard>
    </>
  );
}

type ChargeSnapshot = {
  deliveryStrategies?: { name: string; group?: string | null }[];
  /** Orders placed before strategy groups carried one strategy. */
  deliveryStrategy?: { name: string } | null;
  addressTag?: { name: string } | null;
};

function deliveryDetails(charge: ChargeSnapshot | undefined): string {
  if (!charge) return "";
  const strategies = charge.deliveryStrategies ?? (charge.deliveryStrategy ? [charge.deliveryStrategy] : []);
  return [
    charge.addressTag ? `Address tag: ${charge.addressTag.name}` : null,
    ...strategies.map((s) => `${("group" in s && s.group) || "Delivery strategy"}: ${s.name}`),
  ]
    .filter(Boolean)
    .join(" · ");
}
