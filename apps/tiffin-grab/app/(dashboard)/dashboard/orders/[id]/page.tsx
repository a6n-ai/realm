/* eslint-disable react-hooks/purity */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ActivityIcon, PackageIcon, ReceiptIcon, TruckIcon, WalletIcon } from "lucide-react";
import { NotFoundError, formatMoney as fmt, zonedDateIso } from "@foundry/commons";
import { eq } from "drizzle-orm";
import { findMethod } from "@foundry/payments";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { readOrder, listOrderActivities, resolveSessionVisibleOrgIds, getClaimPaymentContext } from "@/lib/services/orders.service";
import { orderDisplayStatus } from "@/lib/orders/display-status";
import { listDeliveries } from "@/lib/services/deliveries.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes } from "@/lib/catalog/types";
import { getAppSettings, getPaymentConfig } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { db } from "@/db/client";
import { deliveryZones, plans, users } from "@/db/schema";
import { ORDER_STATUS_LABEL, PageHeader, PageShell, SectionCard, StatGrid, type StatItem } from "@/components/ds";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import Link from "next/link";
import { humanDate } from "@/lib/deliveries-view";
import { projectedEndDate, tripsFor } from "@/lib/orders/bounded-deliveries";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import type { OrderPricingSnapshot } from "@/lib/pricing/types";
import { Skeleton } from "@foundry/ui/skeleton";
import { PaymentsPanel } from "./payments-panel";
import { OrderOverview } from "./order-summary-panel";
import { OrderTabs } from "./order-tabs";
import { ActivateCancelControls } from "./activate-cancel-controls";
import { ChangePlanControl } from "./change-plan-control";
import { TrialPill } from "../trial-pill";
import { OrderActivityLog } from "./order-activity-log";
import { OptimoRoutePanel } from "./optimoroute-panel";
import { DeliveriesSection, loadSubscription } from "@/components/dashboard/subscription-panel";

// The full record for ONE order: what it is, what it costs, whether it is paid, and every
// change the customer can make on it (move, swap, address, meal picks) through
// the same server actions, so staff can do it for them. Tabs keep each concern one click away.

type SearchParams = Promise<{ week?: string }>;

export default function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  return (
    <PageShell>
      <Suspense fallback={<OrderDetail.Skeleton />}>
        <OrderDetail params={params} searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function OrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  await requireStaff();
  const { id } = await params;
  const { week } = await searchParams;

  const settingsP = getAppSettings();
  const session = await getSession();
  const visible = await resolveSessionVisibleOrgIds(session);
  let order;
  try {
    order = await readOrder(id, visible);
  } catch (e) {
    void settingsP.catch(() => {});
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const [activities, settings, planRow, customer, paymentCfg, deliveryRows, zone] = await Promise.all([
    listOrderActivities(order.id),
    settingsP,
    db.select({ planType: plans.planType }).from(plans).where(eq(plans.id, order.planId)).limit(1).then((r) => r[0]),
    order.userId != null
      ? db
          .select({ publicId: users.publicId, name: users.name, email: users.email, phone: users.phone })
          .from(users)
          .where(eq(users.id, order.userId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    getPaymentConfig(),
    listDeliveries(order.id),
    order.zoneId != null
      ? db.select({ name: deliveryZones.name }).from(deliveryZones).where(eq(deliveryZones.id, order.zoneId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  const settingsToday = zonedDateIso(Date.now(), settings.timezone);
  const optimoRows = deliveryRows
    .filter((r) => r.deliveryDate >= settingsToday && r.status !== "cancelled")
    .map((r) => ({
      publicId: r.publicId,
      deliveryDate: r.deliveryDate,
      status: r.status,
      routeDriverName: r.routeDriverName,
      routeSyncedAt: r.routeSyncedAt,
    }));

  const planType = (planRow?.planType ?? "tiffin") as "tiffin" | "healthy";
  const categoryRows = await dishCategoriesService.forPlanType(planType);
  const categoryLabels = Object.fromEntries(categoryRows.map((c) => [c.key, c.label]));
  const checkoutMethodId = (order.pricingSnapshot as { paymentMethodId?: string } | null)?.paymentMethodId;
  const checkoutMethodLabel = checkoutMethodId
    ? findMethod(paymentCfg, checkoutMethodId)?.label ?? checkoutMethodId
    : null;
  const catalogSnapshot = await loadCatalogSnapshot(order.organizationId);
  const currentMealSizePublicId = catalogSnapshot.mealSizes.find((m) => m.id === order.mealSizeId)?.publicId;
  const mealSizeOptions = listableMealSizes(catalogSnapshot.mealSizes, currentMealSizePublicId).map((m) => ({
    publicId: m.publicId,
    name: m.name,
    planKey: m.planKey,
  }));

  // Staff-on-behalf claim form for payments that still need a reference/screenshot.
  const claimContexts: Record<string, NonNullable<Awaited<ReturnType<typeof getClaimPaymentContext>>>> = {};
  await Promise.all(
    order.payments
      .filter((p) => p.status === "awaiting_payment" || p.status === "rejected")
      .map(async (p) => {
        const ctx = await getClaimPaymentContext(p.publicId);
        if (ctx) claimContexts[p.publicId] = ctx;
      }),
  );
  const sub = await loadSubscription(order, week);

  const counts = sub.week?.plan.counts ?? null;
  const next = deliveryRows
    .filter((r) => r.deliveryDate >= settingsToday && r.status === "scheduled")
    .sort((x, y) => x.deliveryDate.localeCompare(y.deliveryDate))[0];
  const paid = order.payments
    .filter((p) => p.status === "paid" || p.status === "simulated_paid")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const due = Math.max(Number(order.total) - paid, 0);
  const toReview = order.payments.filter((p) => p.status === "pending_verification").length;
  const pendingPay = order.payments.find((p) => p.status === "pending_verification");
  const displayStatus = orderDisplayStatus(order.status, order.payments.map((p) => p.status));

  // A WordPress-imported plan waiting to be started: where WordPress left off, and when the
  // balance runs out if it starts on its next due date.
  const migratedPending = order.status === "pending" && order.deploymentId.startsWith("wc-");
  const frequencyKey = catalogSnapshot.frequencies.find((f) => f.id === order.frequencyId)?.key ?? null;
  const migration = migratedPending && frequencyKey
    ? {
        frequencyKey,
        eatingDays: (order.eatingDays ?? []) as DayOfWeek[],
        persons: order.persons,
        tiffinCount: order.tiffinCount,
        startDate: order.startDate,
        wordpress: (order.pricingSnapshot as OrderPricingSnapshot | null)?.wordpress ?? null,
      }
    : null;
  const projectedEnd = migration
    ? projectedEndDate({ startDate: migration.startDate, trips: tripsFor(migration.frequencyKey, migration.eatingDays), persons: migration.persons, targetTiffinCount: migration.tiffinCount })
    : null;

  const stats: StatItem[] = [
    { label: "Status", value: ORDER_STATUS_LABEL[displayStatus] ?? displayStatus, icon: ActivityIcon, hint: order.status === "paused" ? "Paused" : order.frequencyName, pixelValue: false },
    {
      label: "Tiffins left",
      value: counts ? `${counts.remaining} / ${counts.total}` : String(order.tiffinCount),
      icon: PackageIcon,
      hint: counts ? `${counts.delivered} delivered${order.pooledTiffinCount > 0 ? ` · ${order.pooledTiffinCount} in pool` : ""}` : "Schedule not started",
    },
    { label: "Next delivery", value: next ? humanDate(next.deliveryDate) : "None", icon: TruckIcon, hint: next?.routeDriverName ?? undefined, pixelValue: false },
    { label: "Paid", value: fmt(paid, settings.currency), icon: WalletIcon, hint: `of ${fmt(Number(order.total), settings.currency)}` },
    { label: "Balance due", value: fmt(due, settings.currency), icon: ReceiptIcon, tone: due > 0 ? "bad" : "ok", hint: toReview ? `${toReview} payment${toReview === 1 ? "" : "s"} to review` : undefined },
  ];

  const headerActions = (
    <>
      {order.trialLength != null && <TrialPill className="self-center" />}
      <ActivateCancelControls orderId={order.publicId} status={order.status} migrated={order.deploymentId.startsWith("wc-")} migration={migration} />
      {/* A trial can only have its dishes edited (orders.service rejects a plan change). */}
      {order.trialLength == null && <ChangePlanControl orderId={order.publicId} status={order.status} mealSizeOptions={mealSizeOptions} />}
    </>
  );

  return (
    <>
      <PageHeader
        icon={PackageIcon}
        title={order.fullName}
        subtitle={`Order ${order.deploymentId} · ${order.planName} · ${order.mealSizeName}`}
        actions={<div className="hidden flex-wrap items-center justify-end gap-2 sm:flex">{headerActions}</div>}
      />
      {/* Phones: actions get their own row so the name keeps the full width. */}
      <div className="-mt-2 flex flex-wrap gap-2 sm:hidden">{headerActions}</div>

      <StatGrid items={stats} cols={5} />

      {migration && (
        <div role="status" className="border-primary/40 bg-primary/5 rounded-xl border px-4 py-3 text-sm">
          <p className="font-medium">
            Imported from WordPress{migration.wordpress ? ` order #${migration.wordpress.orderId}` : ""}. Waiting to be started.
          </p>
          <p className="text-muted-foreground">
            {migration.wordpress?.lastDeliveredDate
              ? `WordPress last delivered ${humanDate(migration.wordpress.lastDeliveredDate)} (${migration.wordpress.deliveredCount} boxes). `
              : "WordPress has not delivered yet. "}
            {migration.tiffinCount} tiffins left · next due {humanDate(migration.startDate)}
            {projectedEnd ? ` · ends ${humanDate(projectedEnd)}` : ""}
            {migration.wordpress ? ` · balance as of ${humanDate(migration.wordpress.refreshedOn)}` : ""}
          </p>
        </div>
      )}

      {pendingPay && (
        <div role="status" className="border-warn/40 bg-warn/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <div className="min-w-0 text-sm">
            <p className="font-medium">Payment awaiting approval</p>
            <p className="text-muted-foreground">
              {fmt(Number(pendingPay.amount), settings.currency)}
              {pendingPay.method === "etransfer" ? " by e-Transfer" : ""}
              {pendingPay.reference ? ` · ref ${pendingPay.reference}` : ""}
              {pendingPay.proofThumbUrl ? " · screenshot attached" : ""}
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="?tab=payments" scroll={false}>Review payment</Link>
          </Button>
        </div>
      )}

      <OrderTabs
        badges={toReview ? { payments: <Badge variant="secondary" className="h-5 px-1.5 tabular-nums">{toReview}</Badge> } : undefined}
        panels={{
          overview: (
            <OrderOverview
              order={order}
              customer={customer}
              zoneName={zone?.name ?? null}
              timezone={settings.timezone}
              currency={settings.currency}
              categoryLabels={categoryLabels}
            />
          ),
          deliveries: (
            <>
              <DeliveriesSection data={sub} />
              <SectionCard title="Routing" subtitle="Push or pull an upcoming delivery in OptimoRoute when the scheduled sync went wrong.">
                <OptimoRoutePanel orderId={order.publicId} rows={optimoRows} />
              </SectionCard>
            </>
          ),
          payments: (
            <SectionCard title="Payments" subtitle="Verify or reject claims, and share the pay link with the customer.">
              <PaymentsPanel
                orderId={order.publicId}
                deploymentId={order.deploymentId}
                orderTotal={Number(order.total)}
                currency={settings.currency}
                timezone={settings.timezone}
                checkoutMethodLabel={checkoutMethodLabel}
                pricingSnapshot={order.pricingSnapshot}
                payments={order.payments}
                claimContexts={claimContexts}
              />
            </SectionCard>
          ),
          activity: (
            <SectionCard title="Activity" subtitle="Every change on this order, by staff, the customer or the system.">
              <OrderActivityLog activities={activities} />
            </SectionCard>
          ),
        }}
      />
    </>
  );
}

OrderDetail.Skeleton = function OrderDetailSkeleton() {
  return (
    <>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <SectionCard key={i} title={i === 0 ? "Plan & schedule" : "Customer & delivery"}>
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
          </SectionCard>
        ))}
      </div>
    </>
  );
};
