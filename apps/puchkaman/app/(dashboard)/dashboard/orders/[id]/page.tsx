import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, PackageIcon } from "lucide-react";
import { formatMoney } from "@realm/commons";
import { PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { Button } from "@realm/ui/button";
import { CheckPaymentStatusButton } from "@/components/admin/check-payment-status-button";
import { requireAdmin } from "@/lib/auth/guards";
import { ordersService } from "@/lib/services/orders.service";

type Params = Promise<{ id: string }>;

export default async function OrderDetailPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  let detail;
  try {
    detail = await ordersService.getAdminDetail(id);
  } catch {
    notFound();
  }
  const { order, items, payments } = detail;
  const canCheckStatus = Boolean(order.cloverOrderId || payments.some((p) => p.cloverChargeId));

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
              <dd className="capitalize">{order.fulfillment}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd>{order.customerEmail}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{order.customerPhone ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Clover order</dt>
              <dd className="font-mono text-xs">{order.cloverOrderId ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(Number(order.subtotal))}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="tabular-nums">{formatMoney(Number(order.tax))}</dd>
            </div>
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
                    <div className="font-mono">Charge: {p.cloverChargeId ?? "—"}</div>
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
                <div className="text-muted-foreground font-mono text-xs">{it.cloverItemId}</div>
              </div>
              <div className="text-right tabular-nums">
                <div>{formatMoney(Number(it.lineTotal))}</div>
                <div className="text-muted-foreground text-xs">
                  @ {formatMoney(Number(it.unitPrice))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </PageShell>
  );
}
