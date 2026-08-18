import { zonedDateIso } from "@realm/commons";
import { eq } from "drizzle-orm";
import { readOrder } from "@/lib/services/orders.service";
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
import { MealsGrid } from "@/app/(dashboard)/dashboard/meals/meals-grid";
import { DeliveryCalendarSkeleton } from "@/app/(customer)/me/deliveries/delivery-calendar";
import { monthFetchRange, parseMonthParam } from "@/app/(customer)/me/deliveries/calendar-constants";
// Still owned by the order route: it is a thin wrapper over the customer's DeliveryCalendar
// and pairs with fetchOrderDeliveriesMonth, which lives beside it.
import { AdminOrderDeliveries } from "@/app/(dashboard)/dashboard/orders/[id]/admin-order-deliveries";

export const SUBSCRIPTION_SECTIONS = {
  deliveries: { title: "Deliveries" },
  meals: { title: "This week's meals" },
} as const;

/**
 * What staff can change on ONE subscription: the delivery calendar and this week's meal
 * picks. Extracted from the order detail page so that page stays readable, and so a
 * second mount point (a customer-level view, an ops console) gets the same controls
 * rather than a second implementation.
 *
 * The activity log is deliberately NOT here — the host page owns it, since it logs more
 * than this panel can change (payments, lifecycle).
 */
export async function SubscriptionPanel({
  orderPublicId,
  monthParam,
  basePath,
}: {
  orderPublicId: string;
  monthParam?: string;
  /** Where the calendar's month links point, so the host page's params survive paging. */
  basePath: string;
}) {
  const [order, settings] = await Promise.all([readOrder(orderPublicId), getAppSettings()]);

  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const today = zonedDateIso(Date.now(), settings.timezone);
  const monthKey = parseMonthParam(monthParam, today);
  const { from, until } = monthFetchRange(monthKey, today);

  const planRow = await db
    .select({ planType: plans.planType, tagLabel: plans.tagLabel, tagColor: plans.tagColor })
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
          mealSizeId: order.mealSizeId,
          mealSizeName: order.mealSizeName,
          persons: order.persons,
          categoryCounts,
          tagLabel: planRow?.tagLabel ?? null,
          tagColor: planRow?.tagColor ?? null,
        }
      : null;

  const waitlisted =
    order.userId != null && (order.status === "waitlisted" || order.status === "pending")
      ? (await myWaitlistedSubscriptions(order.userId)).filter((s) => s.publicId === order.publicId)
      : [];

  const [deliveriesBundle, grid] = await Promise.all([
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
    </>
  );
}
