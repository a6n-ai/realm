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

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Mirrors the live tab: status row, framed month calendar, and the selected day's panel. */
export function DeliveriesSectionSkeleton() {
  return (
    <SectionCard title="Deliveries" subtitle="Pick a day to edit its meal, move it, or send it to another address.">
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading deliveries">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-28" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="grid items-stretch gap-4 lg:grid-cols-[3fr_2fr]">
          <div className="bg-card flex min-h-[600px] flex-col gap-3 rounded-xl border p-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="size-8" />
              <Skeleton className="size-8" />
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="grid grid-cols-7 gap-2 border-b pb-2">
              {range(7).map((i) => <Skeleton key={i} className="h-4 w-8" />)}
            </div>
            <div className="grid flex-1 grid-cols-7 grid-rows-6">
              {range(42).map((i) => {
                const row = Math.floor(i / 7);
                // Weekday chips in the middle weeks, the way a running plan fills the month.
                const chip = row >= 2 && row <= 4 && i % 7 < 5;
                return (
                  <div key={i} className="flex flex-col justify-between gap-1 border-e border-b p-1.5 last:border-e-0 [&:nth-child(7n)]:border-e-0">
                    {chip ? <Skeleton className="h-5 w-full" /> : <span />}
                    <Skeleton className="h-3 w-4 self-end" />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-card flex flex-col gap-6 rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-36" />
              </div>
            </div>
            <div className="flex items-start">
              {range(3).map((i) => (
                <div key={i} className={i < 2 ? "flex flex-1 flex-col gap-2" : "flex flex-col gap-2"}>
                  <div className="flex items-center">
                    <Skeleton className="size-8 rounded-full" />
                    {i < 2 && <Skeleton className="mx-2 h-0.5 flex-1" />}
                  </div>
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <div className="flex gap-2 border-t pt-3">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-36" />
                <Skeleton className="h-8 w-28" />
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t pt-5">
              <Skeleton className="h-3 w-12" />
              <div className="grid grid-cols-3 gap-2">
                {range(4).map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
