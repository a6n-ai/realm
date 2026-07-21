import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { NotFoundError, formatMoney as fmt } from "@realm/commons";
import { requireStaff } from "@/lib/auth/guards";
import { readOrder, listOrderActivities } from "@/lib/services/orders.service";
import { describeActivity } from "@/lib/services/order-activity-describe";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { effectiveAddress, listDeliveries } from "@/lib/services/deliveries.service";
import { orderTiffinCounts } from "@/lib/services/customer-deliveries.service";
import { buildMealsGrid } from "@/lib/menu/meals-grid";
import { formatEpoch } from "@/lib/format/datetime";
import {
  PageShell,
  PageHeader,
  SectionCard,
  ListRow,
  OrderStatusBadge,
  SkeletonCardGrid,
} from "@/components/ds";
import { Skeleton } from "@realm/ui/skeleton";
import { MealsGrid } from "../../meals/meals-grid";
import { LifecycleControls } from "./lifecycle-controls";
import { PoolControls } from "./pool-controls";
import { DeliveriesPanel, DeliveriesPanelSkeleton } from "./deliveries-panel";
import type { DeliveryRow } from "./deliveries-panel-columns";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageShell>
      <Suspense fallback={<OrderDetail.Skeleton />}>
        <OrderDetail params={params} />
      </Suspense>
    </PageShell>
  );
}

async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const settingsP = getAppSettings();
  let order;
  try {
    order = await readOrder(id);
  } catch (e) {
    void settingsP.catch(() => {});
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const [activities, settings, rawDeliveries, tiffinCounts] = await Promise.all([
    listOrderActivities(order.id),
    settingsP,
    listDeliveries(order.id),
    orderTiffinCounts(order.publicId),
  ]);

  const dateById = new Map(rawDeliveries.map((d) => [d.id, d.deliveryDate]));
  const deliveryRows: DeliveryRow[] = rawDeliveries.map((d) => {
    const addr = effectiveAddress(d, order);
    return {
      publicId: d.publicId,
      deliveryDate: d.deliveryDate,
      status: d.status,
      cutoffAt: d.cutoffAt,
      isMakeup: d.makeupForDeliveryId !== null,
      makeupForDate: d.makeupForDeliveryId !== null ? (dateById.get(d.makeupForDeliveryId) ?? null) : null,
      hasAddressOverride: d.addressLine !== null,
      address: {
        fullName: addr.fullName,
        addressLine: addr.addressLine ?? "",
        city: addr.city,
        postalCode: addr.postalCode ?? "",
      },
    };
  });

  const grid = await buildMealsGrid(
    {
      id: order.id, publicId: order.publicId, planId: order.planId, persons: order.persons,
      categoryCounts: order.categoryCounts,
      mealSlots: order.mealSlots, includeSaturday: order.includeSaturday, includeSunday: order.includeSunday,
      startDate: order.startDate, durationWeeks: order.durationWeeks, frequencyKey: order.frequencyKey,
    },
    settings,
  );

  return (
    <>
      <PageHeader icon={PackageIcon} title={order.fullName} />

      <SectionCard title="Summary">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <OrderStatusBadge status={order.status} />
            <span className="text-muted-foreground">{order.deploymentId}</span>
          </div>
          <p><span className="text-muted-foreground">Plan: </span>{order.planName} · {order.mealSizeName} · {order.frequencyKey}</p>
          <p><span className="text-muted-foreground">Schedule: </span>start {order.startDate} · {order.durationWeeks} weeks · {order.persons} person(s) · {order.mealSlots.join(", ")}</p>
          <p><span className="text-muted-foreground">Address: </span>{order.addressLine}, {order.city} {order.postalCode}</p>
          <p><span className="text-muted-foreground">Total: </span>{fmt(Number(order.total))} · Payments: {order.payments.map((p) => fmt(Number(p.amount))).join(", ") || "none"}</p>
        </div>
      </SectionCard>

      <SectionCard title="Lifecycle">
        <LifecycleControls orderId={order.publicId} status={order.status} />
      </SectionCard>

      <SectionCard title="Tiffins">
        <PoolControls orderId={order.publicId} counts={tiffinCounts} />
      </SectionCard>

      <SectionCard title="Deliveries">
        <DeliveriesPanel orderId={order.publicId} deliveries={deliveryRows} orderStatus={order.status} />
      </SectionCard>

      <SectionCard title="This week's meals">
        {order.status === "cancelled" ? (
          <p className="text-muted-foreground text-sm">This order is cancelled — meal selections are closed.</p>
        ) : grid.empty === "no-week" ? (
          <p className="text-muted-foreground text-sm">This week&apos;s menu hasn&apos;t been published yet.</p>
        ) : grid.empty === "no-dates" ? (
          <p className="text-muted-foreground text-sm">No deliveries scheduled for this week on this order.</p>
        ) : grid.empty === null ? (
          <MealsGrid
            orderId={order.publicId}
            menuWeekId={grid.releasedWeek.publicId}
            grid={grid.grid}
            persons={grid.persons}
            weekDates={grid.weekDatesView}
            categories={grid.categories}
            timezone={settings.timezone}
          />
        ) : null}
      </SectionCard>

      <SectionCard title="Activity">
        {activities.length === 0 ? (
          <p className="text-muted-foreground text-sm">No activity yet.</p>
        ) : (
          <div className="space-y-2">
            {activities.map((a) => (
              <ListRow key={a.publicId} title={describeActivity(a)} meta={formatEpoch(a.createdAt, { mode: "datetime", timeZone: settings.timezone })} />
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}

// Exact loading twin: reuses OrderDetail's own PageHeader/SectionCard/ListRow
// layout with grey blocks where data goes, so the fallback stays in sync with
// the real render by construction.
OrderDetail.Skeleton = function OrderDetailSkeleton() {
  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-8 w-48" />
        </div>
      </div>

      <SectionCard title="Summary">
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full max-w-md" />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Lifecycle">
        <Skeleton className="h-9 w-48" />
      </SectionCard>

      <SectionCard title="Tiffins">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Deliveries">
        <DeliveriesPanelSkeleton />
      </SectionCard>

      <SectionCard title="This week's meals">
        <SkeletonCardGrid count={6} />
      </SectionCard>

      <SectionCard title="Activity">
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <ListRow key={i} title={<Skeleton className="h-4 w-40" />} meta={<Skeleton className="h-3 w-24" />} />
          ))}
        </div>
      </SectionCard>
    </>
  );
};
