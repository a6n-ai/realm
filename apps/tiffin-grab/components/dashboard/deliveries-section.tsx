import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import type { OrderDetail } from "@/lib/services/orders.service";
import { loadOrderWeek, type OrderWeek } from "@/lib/services/order-week.service";
import { OrderWeekHub } from "@/components/dashboard/order-week/order-week-hub";
import type { OptimoRouteRow } from "@/app/(dashboard)/dashboard/orders/[id]/optimoroute-panel";
import type { Subscription } from "@/lib/services/customer-deliveries.service";
import { orderDisplayStatus } from "@/lib/orders/display-status";
import { zonedDateIso } from "@foundry/commons";
import { db } from "@/db/client";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { isOrderFullyPaused } from "@/lib/services/pause-state";
import { plans } from "@/db/schema";
import { loadSubscriptionAddons } from "@/lib/menu/order-addon-items";
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
  readOnly: boolean;
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
  const addons = (await loadSubscriptionAddons([order.id])).get(order.id) ?? [];
  const planType = (planRow?.planType ?? "tiffin") as "tiffin" | "healthy";
  const categoryCounts = (order.categoryCounts as Record<string, number> | null) ?? {};
  const displayStatus = orderDisplayStatus(
    order.status,
    order.payments.map((p) => p.status),
  );
  // While payment is unconfirmed, match the customer: schedule and picks stay hidden.
  const paymentReview = displayStatus === "payment_review";

  const live = order.status === "active" || order.status === "paused";
  const fullyPaused = live && (await isOrderFullyPaused(db, order.id, zonedDateIso(Date.now(), (await getAppSettings()).timezone)));
  // A finished plan still shows its days, read-only.
  const finished = order.status === "completed";
  const subscription: Subscription | null =
    live || finished
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
          addons,
          fullyPaused,
        }
      : null;

  const week =
    subscription && order.userId != null
      ? await loadOrderWeek(order.userId, subscription, weekParam)
      : null;

  const session = await getSession();
  // Under payment review staff can check the schedule, but nothing changes until the money is verified.
  return { order, paymentReview, week, readOnly: finished || paymentReview, canEditDeliveryStatus: session?.user?.role === "admin" };
}

export function DeliveriesSection({ data, routing = [] }: { data: SubscriptionData; routing?: OptimoRouteRow[] }) {
  const { order, paymentReview, week } = data;
  const subtitle = paymentReview
    ? "Payment is under review. Check the schedule here; changes unlock once the payment is verified."
    : data.readOnly
      ? "This plan is over. Every day is shown as it went; nothing can be changed."
      : "Pick a day to edit its meal, move it, or send it to another address.";
  return (
    <SectionCard title="Deliveries" subtitle={subtitle}>
      {paymentReview && (
        <p className="text-muted-foreground text-sm" data-testid="payment-review-deliveries">
          Read-only until the payment is confirmed on the Payments tab. The customer can&apos;t see this calendar yet either.
        </p>
      )}
      {week ? (
        <OrderWeekHub data={week} canEditDeliveryStatus={data.canEditDeliveryStatus} readOnly={data.readOnly} routing={routing} />
      ) : paymentReview ? null : (
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
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-80" />
        <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
          <Skeleton className="h-[600px] w-full" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </div>
    </SectionCard>
  );
}
