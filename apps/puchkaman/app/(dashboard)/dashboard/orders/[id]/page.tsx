import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, PackageIcon } from "lucide-react";
import { formatMoney } from "@realm/commons";
import { getCloverConnection } from "@realm/clover";
import { PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { Button } from "@realm/ui/button";
import { CheckPaymentStatusButton } from "@/components/admin/check-payment-status-button";
import { OrderEmployeeAssign } from "@/components/admin/order-employee-assign";
import { requireAdmin } from "@/lib/auth/guards";
import { getDeliveryLabelsForOrder } from "@/lib/delivery/zones.service";
import { employeesService } from "@/lib/services/employees.service";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { ordersService } from "@/lib/services/orders.service";

type Params = Promise<{ id: string }>;

export default async function OrderDetailPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const [detailResult, clover, assignable] = await Promise.all([
    ordersService.getAdminDetail(id).then(
      (d) => ({ ok: true as const, d }),
      () => ({ ok: false as const }),
    ),
    getCloverConnection(integrationsConfigStore),
    employeesService.listAssignable().catch(() => []),
  ]);
  if (!detailResult.ok) notFound();
  const { order, items, payments, assignedEmployee } = detailResult.d;
  const cloverEnabled = Boolean(clover.installed);
  const { typeLabel: deliveryTypeLabel, zoneName: deliveryZoneName } = await getDeliveryLabelsForOrder(
    order.deliveryTypeId,
    order.deliveryZoneId,
  );
  const canCheckStatus =
    cloverEnabled && Boolean(order.cloverOrderId || payments.some((p) => p.cloverChargeId));

  return (
    <PageShell>
      <PageHeader
        icon={PackageIcon}
        title={order.customerName}
        subtitle={order.publicId}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canCheckStatus ? (
              <CheckPaymentStatusButton orderPublicId={order.publicId} />
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/orders">
                <ArrowLeftIcon />
                Back
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Summary">
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge>{order.status}</Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Fulfillment</dt>
              <dd className="capitalize">{order.fulfillment.replace(/_/g, " ")}</dd>
            </div>
            {deliveryTypeLabel ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Delivery type</dt>
                <dd>
                  {deliveryTypeLabel}
                  {deliveryZoneName ? (
                    <span className="text-muted-foreground"> ({deliveryZoneName})</span>
                  ) : null}
                </dd>
              </div>
            ) : null}
            {order.deliveryAddress ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Delivery address</dt>
                <dd className="text-right">
                  {order.deliveryAddress}
                  {order.deliveryDistanceKm != null ? (
                    <span className="text-muted-foreground"> ({Number(order.deliveryDistanceKm)}km)</span>
                  ) : null}
                </dd>
              </div>
            ) : null}
            {order.scheduledFor ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Scheduled for</dt>
                <dd>
                  {new Date(order.scheduledFor).toLocaleString("en-CA", {
                    timeZone: "America/Toronto",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd>{order.customerEmail}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{order.customerPhone ?? "—"}</dd>
            </div>
            {cloverEnabled && order.cloverOrderId ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Clover order</dt>
                <dd className="font-mono text-xs">{order.cloverOrderId}</dd>
              </div>
            ) : null}
            {cloverEnabled ? (
              <div className="flex items-start justify-between gap-4 pt-1">
                <dt className="text-muted-foreground pt-1.5">Assigned employee</dt>
                <dd>
                  <OrderEmployeeAssign
                    orderPublicId={order.publicId}
                    employees={assignable.map((e) => ({
                      publicId: e.publicId,
                      name: e.name,
                      role: e.role,
                    }))}
                    currentEmployeePublicId={assignedEmployee?.publicId ?? null}
                    hasCloverOrder={Boolean(order.cloverOrderId)}
                  />
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(Number(order.subtotal))}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="tabular-nums">{formatMoney(Number(order.tax))}</dd>
            </div>
            {/* New orders itemise every applied discount; orders written before
                stacking existed only recorded a single percentage. */}
            {order.pricingSnapshot.discountLines?.length ? (
              order.pricingSnapshot.discountLines.map((d, i) => (
                <div className="flex justify-between gap-4" key={`${d.name}-${i}`}>
                  <dt className="text-muted-foreground">{d.name}</dt>
                  <dd className="tabular-nums">-{formatMoney(d.amount)}</dd>
                </div>
              ))
            ) : order.pricingSnapshot.discountAmount ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Discount ({(order.pricingSnapshot.discountPct ?? 0) * 100}%)</dt>
                <dd className="tabular-nums">-{formatMoney(order.pricingSnapshot.discountAmount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 font-medium">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(Number(order.total))}</dd>
            </div>
            {order.note ? (
              <div className="pt-2">
                <dt className="text-muted-foreground mb-1">Note</dt>
                <dd>{order.note}</dd>
              </div>
            ) : null}
          </dl>
        </SectionCard>

        <SectionCard title="Payment">
          {payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No payments recorded.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {payments.map((p) => (
                <li key={p.publicId} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary">{p.status}</Badge>
                    <span className="font-medium tabular-nums">{formatMoney(Number(p.amount))}</span>
                  </div>
                  <div className="text-muted-foreground mt-2 space-y-1 text-xs">
                    <div>Method: {p.method}</div>
                    {cloverEnabled && p.cloverChargeId ? (
                      <div className="font-mono">Charge: {p.cloverChargeId}</div>
                    ) : null}
                    <div>Id: {p.publicId}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Line items">
        <ul className="divide-y text-sm">
          {items.map((it) => (
            <li key={it.publicId} className="flex items-center justify-between gap-4 py-2">
              <div>
                <div className="font-medium">
                  {it.quantity}× {it.name}
                </div>
                {/* The kitchen works from this list, so free options are shown too. */}
                {it.selectedModifiers.length ? (
                  <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                    {it.selectedModifiers.map((m) => (
                      <li key={m.cloverModifierId}>
                        + {m.name}
                        {m.price > 0 ? ` (${formatMoney(m.price)})` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {cloverEnabled && it.cloverItemId ? (
                  <div className="text-muted-foreground mt-1 font-mono text-xs">
                    {it.cloverItemId}
                  </div>
                ) : null}
              </div>
              <div className="text-right tabular-nums">
                <div>{formatMoney(Number(it.lineTotal))}</div>
                <div className="text-muted-foreground text-xs">
                  {/* unitPrice excludes modifiers, so say so rather than showing a
                      base price that does not multiply out to the line total. */}
                  @ {formatMoney(Number(it.unitPrice))}
                  {it.selectedModifiers.length ? " + options" : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </PageShell>
  );
}
