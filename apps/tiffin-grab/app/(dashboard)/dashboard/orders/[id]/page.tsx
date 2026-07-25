import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { NotFoundError, zonedDateIso } from "@realm/commons";
import { eq } from "drizzle-orm";
import { findMethod } from "@realm/payments";
import { requireStaff } from "@/lib/auth/guards";
import { readOrder, listOrderActivities } from "@/lib/services/orders.service";
import { getAppSettings, getPaymentConfig } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { loadOrderDeliveriesBundle } from "@/lib/services/order-deliveries-bundle.service";
import {
  myWaitlistedSubscriptions,
  type Subscription,
} from "@/lib/services/customer-deliveries.service";
import { buildMealsGrid } from "@/lib/menu/meals-grid";
import { db } from "@/db/client";
import { plans, users } from "@/db/schema";
import {
  PageShell,
  PageHeader,
  SectionCard,
  SkeletonCardGrid,
} from "@/components/ds";
import { Skeleton } from "@realm/ui/skeleton";
import { MealsGrid } from "../../meals/meals-grid";
import { DeliveryCalendarSkeleton } from "@/app/(customer)/me/deliveries/delivery-calendar";
import { monthFetchRange, parseMonthParam } from "@/app/(customer)/me/deliveries/calendar-constants";
import { AdminOrderDeliveries } from "./admin-order-deliveries";
import { PaymentsPanel } from "./payments-panel";
import { OrderSummaryPanel } from "./order-summary-panel";
import { ActivateCancelControls } from "./activate-cancel-controls";
import { OrderActivityLog, OrderActivityLogSkeleton } from "./order-activity-log";

type SearchParams = Promise<{ month?: string }>;

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
  const { month: monthParam } = await searchParams;

  const settingsP = getAppSettings();
  let order;
  try {
    order = await readOrder(id);
  } catch (e) {
    void settingsP.catch(() => {});
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const [activities, settings, planRow, customer, paymentCfg] = await Promise.all([
    listOrderActivities(order.id),
    settingsP,
    db.select({ planType: plans.planType }).from(plans).where(eq(plans.id, order.planId)).limit(1).then((r) => r[0]),
    order.userId != null
      ? db
          .select({ publicId: users.publicId })
          .from(users)
          .where(eq(users.id, order.userId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    getPaymentConfig(),
  ]);

  const today = zonedDateIso(Date.now(), settings.timezone);
  const monthKey = parseMonthParam(monthParam, today);
  const { from, until } = monthFetchRange(monthKey, today);

  const planType = (planRow?.planType ?? "tiffin") as "tiffin" | "healthy";
  const categoryCounts = (order.categoryCounts as Record<string, number> | null) ?? {};
  const categoryRows = await dishCategoriesService.forPlanType(planType);
  const categoryLabels = Object.fromEntries(categoryRows.map((c) => [c.key, c.label]));
  const checkoutMethodId = (order.pricingSnapshot as { paymentMethodId?: string } | null)?.paymentMethodId;
  const checkoutMethodLabel = checkoutMethodId
    ? findMethod(paymentCfg, checkoutMethodId)?.label ?? checkoutMethodId
    : null;

  const subscription: Subscription | null =
    order.status === "active" || order.status === "paused"
      ? {
          publicId: order.publicId,
          planName: order.planName,
          planType,
          planKey: order.planKey,
          status: order.status,
          fullName: order.fullName,
          addressLine: order.addressLine,
          city: order.city,
          postalCode: order.postalCode,
          zoneId: order.zoneId,
          mealSizeName: order.mealSizeName,
          persons: order.persons,
          categoryCounts,
        }
      : null;

  const waitlisted =
    order.userId != null && (order.status === "waitlisted" || order.status === "pending")
      ? (
          await myWaitlistedSubscriptions(order.userId)
        ).filter((s) => s.publicId === order.publicId)
      : [];

  let deliveriesBundle: Awaited<ReturnType<typeof loadOrderDeliveriesBundle>> | null = null;

  if (subscription && order.userId != null) {
    deliveriesBundle = await loadOrderDeliveriesBundle(order.userId, subscription, from, until);
  }

  const grid = await buildMealsGrid(
    {
      id: order.id,
      publicId: order.publicId,
      planId: order.planId,
      persons: order.persons,
      categoryCounts,
      mealSlots: order.mealSlots,
      includeSaturday: order.includeSaturday,
      includeSunday: order.includeSunday,
      startDate: order.startDate,
      durationWeeks: order.durationWeeks,
      frequencyKey: order.frequencyKey,
    },
    settings,
  );

  const basePath = `/dashboard/orders/${order.publicId}`;

  return (
    <>
      <PageHeader
        icon={PackageIcon}
        title={order.fullName}
        subtitle={order.deploymentId}
        actions={<ActivateCancelControls orderId={order.publicId} status={order.status} />}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SectionCard title="Summary">
          <OrderSummaryPanel
            order={order}
            customer={customer}
            timezone={settings.timezone}
            currency={settings.currency}
            categoryLabels={categoryLabels}
          />
        </SectionCard>

        <SectionCard title="Payment">
          <PaymentsPanel
            orderId={order.publicId}
            deploymentId={order.deploymentId}
            orderTotal={Number(order.total)}
            currency={settings.currency}
            timezone={settings.timezone}
            checkoutMethodLabel={checkoutMethodLabel}
            pricingSnapshot={order.pricingSnapshot}
            payments={order.payments}
          />
        </SectionCard>
      </div>

      <SectionCard title="Deliveries">
        {subscription && deliveriesBundle ? (
          <AdminOrderDeliveries
            initial={{ ...deliveriesBundle, monthKey, today }}
            subscription={subscription}
            waitlisted={waitlisted}
            basePath={basePath}
          />
        ) : (
          <DeliveryCalendarSkeleton />
        )}
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
        <OrderActivityLog activities={activities} />
      </SectionCard>
    </>
  );
}

OrderDetail.Skeleton = function OrderDetailSkeleton() {
  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-8 w-48" />
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SectionCard title="Summary">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full max-w-md" />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Payment">
          <Skeleton className="h-32 w-full" />
        </SectionCard>
      </div>

      <SectionCard title="Deliveries">
        <DeliveryCalendarSkeleton />
      </SectionCard>

      <SectionCard title="This week's meals">
        <SkeletonCardGrid count={6} />
      </SectionCard>

      <SectionCard title="Activity">
        <OrderActivityLogSkeleton />
      </SectionCard>
    </>
  );
};
