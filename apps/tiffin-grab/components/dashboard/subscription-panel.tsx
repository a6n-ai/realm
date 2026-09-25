import { eq } from "drizzle-orm";
import { readOrder } from "@/lib/services/orders.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { loadOrderWeek } from "@/lib/services/order-week.service";
import { OrderWeekHub } from "@/components/dashboard/order-week/order-week-hub";
import type { Subscription } from "@/lib/services/customer-deliveries.service";
import { buildMealsGrid } from "@/lib/menu/meals-grid";
import { db } from "@/db/client";
import { plans } from "@/db/schema";
import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard, SkeletonCardGrid } from "@/components/ds";
import { MealsGrid } from "@/app/(dashboard)/dashboard/meals/meals-grid";

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
  weekParam,
  visible,
}: {
  orderPublicId: string;
  /** ?week=YYYY-MM-DD from the host page. */
  weekParam?: string;
  /** Org visibility scope — same value the host page resolved via resolveSessionVisibleOrgIds. */
  visible: "all" | string[];
}) {
  const [order, settings] = await Promise.all([readOrder(orderPublicId, visible), getAppSettings()]);

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
          displayStatus: order.status,
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
          frequencyKey: order.frequencyKey,
        }
      : null;

  const [week, grid] = await Promise.all([
    subscription && order.userId != null ? loadOrderWeek(order.userId, subscription, weekParam) : Promise.resolve(null),
    buildMealsGrid(
      {
        id: order.id,
        publicId: order.publicId,
        planId: order.planId,
        mealSizeId: order.mealSizeId,
        persons: order.persons,
        categoryCounts,
        mealSlots: order.mealSlots,
        startDate: order.startDate,
        durationWeeks: order.durationWeeks,
      },
      settings,
    ),
  ]);

  return (
    <>
      <SectionCard
        title={SUBSCRIPTION_SECTIONS.deliveries.title}
        subtitle="Week view by eating day: delivery days, swaps, reschedule, vacation and make-up."
      >
        {week ? (
          <OrderWeekHub data={week} />
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
        <div className="space-y-3">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </SectionCard>
      <SectionCard title={SUBSCRIPTION_SECTIONS.meals.title}>
        <SkeletonCardGrid count={6} />
      </SectionCard>
    </>
  );
}
