import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import type { OrderDetail } from "@/lib/services/orders.service";
import { loadOrderWeek, type OrderWeek } from "@/lib/services/order-week.service";
import { OrderWeekHub } from "@/components/dashboard/order-week/order-week-hub";
import type { Subscription } from "@/lib/services/customer-deliveries.service";
import { orderDisplayStatus } from "@/lib/orders/display-status";
import { db } from "@/db/client";
import { plans } from "@/db/schema";
import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";

/**
 * What staff can change on ONE subscription: the delivery calendar, where each day offers the
 * customer's own actions (Edit meal, Move, Change address). The host page loads once with
 * loadSubscription and mounts DeliveriesSection wherever it wants.
 */
export type SubscriptionData = {
  order: OrderDetail;
  paymentReview: boolean;
  week: OrderWeek | null;
  canEditDeliveryStatus: boolean;
};

export async function loadSubscription(
  order: OrderDetail,
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
          trial: order.trialLength != null,
        }
      : null;

  const week =
    !paymentReview && subscription && order.userId != null
      ? await loadOrderWeek(order.userId, subscription, weekParam)
      : null;

  const session = await getSession();
  return { order, paymentReview, week, canEditDeliveryStatus: session?.user?.role === "admin" };
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
        <OrderWeekHub data={week} canEditDeliveryStatus={data.canEditDeliveryStatus} />
      ) : (
        <p className="text-muted-foreground text-sm">
          This subscription is {order.status}, so there is no delivery schedule to manage.
        </p>
      )}
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
