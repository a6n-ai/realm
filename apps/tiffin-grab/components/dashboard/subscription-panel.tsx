import { eq } from "drizzle-orm";
import type { OrderDetail } from "@/lib/services/orders.service";
import { loadOrderWeek, type OrderWeek } from "@/lib/services/order-week.service";
import { OrderWeekHub } from "@/components/dashboard/order-week/order-week-hub";
import type { Subscription } from "@/lib/services/customer-deliveries.service";
import { buildMealsGrid } from "@/lib/menu/meals-grid";
import { orderDisplayStatus } from "@/lib/orders/display-status";
import { humanDate } from "@/lib/deliveries-view";
import { db } from "@/db/client";
import { plans } from "@/db/schema";
import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard, SkeletonCardGrid } from "@/components/ds";
import { MealsGrid } from "@/app/(dashboard)/dashboard/meals/meals-grid";

/**
 * What staff can change on ONE subscription: the delivery calendar (move, swap, address) and meal picks for the selected week. The host page loads once with
 * loadSubscription and mounts the two sections in whatever layout it wants; both read the
 * same ?week= so the Deliveries and Meals tabs always show the same week.
 */
export type SubscriptionData = {
  order: OrderDetail;
  paymentReview: boolean;
  week: OrderWeek | null;
  grid: Awaited<ReturnType<typeof buildMealsGrid>> | null;
  timezone: string;
};

export async function loadSubscription(
  order: OrderDetail,
  settings: { timezone: string; cutoffHour: number },
  weekParam: string | undefined,
): Promise<SubscriptionData> {
  const planRow = await db
    .select({ planType: plans.planType, tagLabel: plans.tagLabel, tagColor: plans.tagColor })
    .from(plans)
    .where(eq(plans.id, order.planId))
    .limit(1)
    .then((r) => r[0]);
  const planType = (planRow?.planType ?? "tiffin") as "tiffin" | "healthy";
  const categoryCounts = (order.categoryCounts as Record<string, number> | null) ?? {};
  const displayStatus = orderDisplayStatus(
    order.status,
    order.payments.map((p) => p.status),
  );
  // While payment is unconfirmed, match the customer: schedule and picks stay hidden.
  const paymentReview = displayStatus === "payment_review";

  const subscription: Subscription | null =
    order.status === "active" || order.status === "paused"
      ? {
          publicId: order.publicId,
          planName: order.planName,
          planType,
          planKey: order.planKey,
          status: order.status,
          displayStatus,
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

  const week =
    !paymentReview && subscription && order.userId != null
      ? await loadOrderWeek(order.userId, subscription, weekParam)
      : null;
  // Meals follow the week the calendar resolved (clamped to the plan's window).
  const grid = !paymentReview
    ? await buildMealsGrid(
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
        week?.weekStart,
      )
    : null;

  return { order, paymentReview, week, grid, timezone: settings.timezone };
}

export function DeliveriesSection({ data }: { data: SubscriptionData }) {
  const { order, paymentReview, week } = data;
  return (
    <SectionCard title="Deliveries" subtitle="Pick a day to edit its meal, move it, or send it to another address.">
      {paymentReview ? (
        <p className="text-muted-foreground text-sm" data-testid="payment-review-deliveries">
          Payment is under review. Confirm it on the Payments tab. The delivery calendar unlocks once it&apos;s verified,
          same as the customer view.
        </p>
      ) : week ? (
        <OrderWeekHub data={week} />
      ) : (
        <p className="text-muted-foreground text-sm">
          This subscription is {order.status}, so there is no delivery schedule to manage.
        </p>
      )}
    </SectionCard>
  );
}

export function MealsSection({ data }: { data: SubscriptionData }) {
  const { order, paymentReview, grid, timezone } = data;
  const weekOf = grid?.empty === null ? grid.weekDatesView[0]?.weekStartIso : undefined;
  const title = weekOf ? `Meals · week of ${humanDate(weekOf)}` : "Meals";
  return (
    <SectionCard title={title} subtitle="Change a day's dish picks. The week follows the one selected on the Deliveries tab.">
      {paymentReview ? (
        <p className="text-muted-foreground text-sm">Meal picks unlock after payment is confirmed.</p>
      ) : order.status === "cancelled" ? (
        <p className="text-muted-foreground text-sm">This order is cancelled, so meal selections are closed.</p>
      ) : grid == null ? null : grid.empty === "no-week" ? (
        <p className="text-muted-foreground text-sm">The menu for this week hasn&apos;t been published yet.</p>
      ) : grid.empty === "no-dates" ? (
        <p className="text-muted-foreground text-sm">No deliveries are scheduled for this week on this order.</p>
      ) : grid.empty === null ? (
        <MealsGrid
          orderId={order.publicId}
          menuWeekId={grid.releasedWeek.publicId}
          grid={grid.grid}
          persons={grid.persons}
          weekDates={grid.weekDatesView}
          categories={grid.categories}
          timezone={timezone}
        />
      ) : null}
    </SectionCard>
  );
}

export function DeliveriesSectionSkeleton() {
  return (
    <SectionCard title="Deliveries">
      <div className="space-y-3">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </SectionCard>
  );
}

export function MealsSectionSkeleton() {
  return (
    <SectionCard title="Meals">
      <SkeletonCardGrid count={6} />
    </SectionCard>
  );
}
