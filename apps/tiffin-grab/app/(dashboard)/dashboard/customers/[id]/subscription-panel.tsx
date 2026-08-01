import { zonedDateIso } from "@realm/commons";
import { eq } from "drizzle-orm";
import { readOrder, listOrderActivities } from "@/lib/services/orders.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { loadOrderDeliveriesBundle } from "@/lib/services/order-deliveries-bundle.service";
import {
  myWaitlistedSubscriptions,
  type Subscription,
} from "@/lib/services/customer-deliveries.service";
import { buildMealsGrid } from "@/lib/menu/meals-grid";
import { db } from "@/db/client";
import { plans } from "@/db/schema";
import { SectionCard, SkeletonCardGrid } from "@/components/ds";
import { MealsGrid } from "../../meals/meals-grid";
import { DeliveryCalendarSkeleton } from "@/app/(customer)/me/deliveries/delivery-calendar";
import { monthFetchRange, parseMonthParam } from "@/app/(customer)/me/deliveries/calendar-constants";
// Still owned by the order route: it is a thin wrapper over the customer's DeliveryCalendar
// and pairs with fetchOrderDeliveriesMonth, which lives beside it. Only the mount moved.
import { AdminOrderDeliveries } from "../../orders/[id]/admin-order-deliveries";
import { OrderActivityLog, OrderActivityLogSkeleton } from "../../orders/[id]/order-activity-log";

export const SUBSCRIPTION_SECTIONS = {
  deliveries: { title: "Deliveries" },
  meals: { title: "This week's meals" },
  activity: { title: "Subscription activity" },
} as const;

/**
 * Everything staff can do to ONE subscription: the delivery calendar, this week's meal
 * picks, and the log of what changed. Moved here from the order detail page — the order
 * page answers "what did this cost and has it been paid", this answers "what is this
 * person receiving".
 */
export async function SubscriptionPanel({
  orderPublicId,
  monthParam,
  basePath,
}: {
  orderPublicId: string;
  monthParam?: string;
  /** Where the calendar's month links point — this page, so ?order= survives paging. */
  basePath: string;
}) {
  const [order, settings] = await Promise.all([readOrder(orderPublicId), getAppSettings()]);

  const today = zonedDateIso(Date.now(), settings.timezone);
  const monthKey = parseMonthParam(monthParam, today);
  const { from, until } = monthFetchRange(monthKey, today);

  const planRow = await db
    .select({ planType: plans.planType })
    .from(plans)
    .where(eq(plans.id, order.planId))
    .limit(1)
    .then((r) => r[0]);
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
      ? (await myWaitlistedSubscriptions(order.userId)).filter((s) => s.publicId === order.publicId)
      : [];

  const [deliveriesBundle, grid, activities] = await Promise.all([
    subscription && order.userId != null
      ? loadOrderDeliveriesBundle(order.userId, subscription, from, until)
      : Promise.resolve(null),
    buildMealsGrid(
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
    ),
    listOrderActivities(order.id),
  ]);

  return (
    <>
      <SectionCard title={SUBSCRIPTION_SECTIONS.deliveries.title}>
        {subscription && deliveriesBundle ? (
          <AdminOrderDeliveries
            initial={{ ...deliveriesBundle, monthKey, today }}
            subscription={subscription}
            waitlisted={waitlisted}
            basePath={basePath}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            This subscription is {order.status} — there is no delivery schedule to manage.
          </p>
        )}
      </SectionCard>

      <SectionCard title={SUBSCRIPTION_SECTIONS.meals.title}>
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

      <SectionCard title={SUBSCRIPTION_SECTIONS.activity.title}>
        <OrderActivityLog activities={activities} scope="subscription" />
      </SectionCard>
    </>
  );
}

export function SubscriptionPanelSkeleton() {
  return (
    <>
      <SectionCard title={SUBSCRIPTION_SECTIONS.deliveries.title}>
        <DeliveryCalendarSkeleton />
      </SectionCard>
      <SectionCard title={SUBSCRIPTION_SECTIONS.meals.title}>
        <SkeletonCardGrid count={6} />
      </SectionCard>
      <SectionCard title={SUBSCRIPTION_SECTIONS.activity.title}>
        <OrderActivityLogSkeleton />
      </SectionCard>
    </>
  );
}
