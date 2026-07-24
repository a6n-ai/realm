import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { NotFoundError, formatMoney as fmt, zonedDateIso } from "@realm/commons";
import { eq } from "drizzle-orm";
import { requireStaff } from "@/lib/auth/guards";
import { readOrder, listOrderActivities } from "@/lib/services/orders.service";
import { describeActivity } from "@/lib/services/order-activity-describe";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { effectiveAddress } from "@/lib/services/deliveries.service";
import {
  myCalendar,
  myDeliveries,
  myDeliveryMeal,
  myPausePanel,
  myTiffinCounts,
  myWaitlistedSubscriptions,
  type Subscription,
} from "@/lib/services/customer-deliveries.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { buildMealsGrid } from "@/lib/menu/meals-grid";
import { formatEpoch } from "@/lib/format/datetime";
import { db } from "@/db/client";
import { plans, users } from "@/db/schema";
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
import { DeliveryCalendar, DeliveryCalendarSkeleton } from "@/app/(customer)/me/deliveries/delivery-calendar";
import { monthFetchRange, parseMonthParam, type CalendarCell } from "@/app/(customer)/me/deliveries/calendar-constants";
import { PaymentsPanel } from "./payments-panel";
import { ActivateCancelControls } from "./activate-cancel-controls";

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

  const [activities, settings, planRow, customer] = await Promise.all([
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
  ]);

  const today = zonedDateIso(Date.now(), settings.timezone);
  const monthKey = parseMonthParam(monthParam, today);
  const { from, until } = monthFetchRange(monthKey, today);

  const planType = (planRow?.planType ?? "tiffin") as "tiffin" | "healthy";
  const categoryCounts = (order.categoryCounts as Record<string, number> | null) ?? {};

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

  let deliveries: {
    deliveries: Awaited<ReturnType<typeof loadOrderDeliveries>>["deliveries"];
    pausePanels: Awaited<ReturnType<typeof loadOrderDeliveries>>["pausePanels"];
    calendarCells: Awaited<ReturnType<typeof loadOrderDeliveries>>["calendarCells"];
    categoryLabels: Record<string, string>;
    tiffinCounts: Awaited<ReturnType<typeof loadOrderDeliveries>>["tiffinCounts"] | undefined;
  } = {
    deliveries: [],
    pausePanels: {},
    calendarCells: {},
    categoryLabels: {},
    tiffinCounts: undefined,
  };

  if (subscription && order.userId != null) {
    deliveries = await loadOrderDeliveries(order.userId, subscription, from, until);
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
        subtitle={`${order.deploymentId} · ${order.planName} · ${order.mealSizeName}`}
        actions={<ActivateCancelControls orderId={order.publicId} status={order.status} />}
      />

      <SectionCard title="Summary">
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <OrderStatusBadge status={order.status} />
            <span className="text-muted-foreground">{order.deploymentId}</span>
            {customer && (
              <Link
                href={`/dashboard/customers/${customer.publicId}`}
                className="text-primary text-sm underline-offset-2 hover:underline"
              >
                Customer profile
              </Link>
            )}
          </div>
          <p>
            <span className="text-muted-foreground">Plan: </span>
            {order.planName} · {order.mealSizeName} · {order.frequencyKey}
          </p>
          <p>
            <span className="text-muted-foreground">Schedule: </span>
            start {order.startDate} · {order.durationWeeks} weeks · {order.persons} person(s) ·{" "}
            {order.mealSlots.join(", ")}
          </p>
          <p>
            <span className="text-muted-foreground">Address: </span>
            {order.addressLine}, {order.city} {order.postalCode}
          </p>
          <p>
            <span className="text-muted-foreground">Total: </span>
            {fmt(Number(order.total))}
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Payments">
        <PaymentsPanel
          orderId={order.publicId}
          deploymentId={order.deploymentId}
          payments={order.payments}
        />
      </SectionCard>

      <SectionCard title="Deliveries">
        <DeliveryCalendar
          subscriptions={subscription ? [subscription] : []}
          selectedPublicId={subscription?.publicId}
          deliveries={deliveries.deliveries}
          pausePanels={deliveries.pausePanels}
          calendarCells={deliveries.calendarCells}
          categoryLabels={deliveries.categoryLabels}
          monthKey={monthKey}
          waitlisted={waitlisted}
          today={today}
          tiffinCounts={deliveries.tiffinCounts}
          basePath={basePath}
          title="Deliveries"
          subtitle="Same calendar, vacation, skip, and pool controls the customer sees."
          showBrowsePlans={false}
        />
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
              <ListRow
                key={a.publicId}
                title={describeActivity(a)}
                meta={formatEpoch(a.createdAt, { mode: "datetime", timeZone: settings.timezone })}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}

async function loadOrderDeliveries(userId: bigint, selected: Subscription, from: string, until: string) {
  const [rawDeliveries, pausePanel, calendarDays, tiffinCounts] = await Promise.all([
    myDeliveries(userId, from, until),
    myPausePanel(userId, selected.publicId),
    myCalendar(userId, selected.publicId, { from, until }),
    myTiffinCounts(userId, selected.publicId),
  ]);

  const calendarCells: Record<string, CalendarCell[]> = {
    [selected.publicId]: calendarDays,
  };

  const categoryRows = await dishCategoriesService.forPlanType(selected.planType);
  const categoryLabels: Record<string, string> = {};
  for (const r of categoryRows) categoryLabels[r.key] = r.label;

  const selectedDeliveries = rawDeliveries.filter((d) => d.orderPublicId === selected.publicId);
  const deliveries = await Promise.all(
    selectedDeliveries.map(async (d) => {
      const meal = await myDeliveryMeal(d);
      const hasAddressOverride = d.addressLine !== null;
      const address = effectiveAddress(d, selected);
      return { ...d, meal, address, hasAddressOverride };
    }),
  );

  return {
    deliveries,
    pausePanels: { [selected.publicId]: pausePanel },
    calendarCells,
    categoryLabels,
    tiffinCounts,
  };
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

      <SectionCard title="Summary">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full max-w-md" />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Payments">
        <Skeleton className="h-24 w-full" />
      </SectionCard>

      <SectionCard title="Deliveries">
        <DeliveryCalendarSkeleton />
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
