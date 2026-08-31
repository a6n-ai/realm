import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { NotFoundError } from "@realm/commons";
import { eq } from "drizzle-orm";
import { findMethod } from "@realm/payments";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { readOrder, listOrderActivities, resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { getAppSettings, getPaymentConfig } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { db } from "@/db/client";
import { plans, users } from "@/db/schema";
import {
  PageShell,
  PageHeader,
  SectionCard,
} from "@/components/ds";
import { Skeleton } from "@realm/ui/skeleton";
import { PaymentsPanel } from "./payments-panel";
import { OrderSummaryPanel } from "./order-summary-panel";
import { ActivateCancelControls } from "./activate-cancel-controls";
import { OrderActivityLog, OrderActivityLogSkeleton } from "./order-activity-log";
import { SubscriptionPanel, SubscriptionPanelSkeleton } from "@/components/dashboard/subscription-panel";

// The full record for ONE order: what it is, what it costs, whether it is paid, and the
// same delivery/meal controls the customer page shows. The customer page is the
// multi-order view — it spans a person's subscriptions; this is the single-order view.
// Both mount the same SubscriptionPanel so they cannot drift.

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
  const { month } = await searchParams;

  const settingsP = getAppSettings();
  const session = await getSession();
  const visible = await resolveSessionVisibleOrgIds(session);
  let order;
  try {
    order = await readOrder(id, visible);
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

  const planType = (planRow?.planType ?? "tiffin") as "tiffin" | "healthy";
  const categoryCounts = (order.categoryCounts as Record<string, number> | null) ?? {};
  const categoryRows = await dishCategoriesService.forPlanType(planType);
  const categoryLabels = Object.fromEntries(categoryRows.map((c) => [c.key, c.label]));
  const checkoutMethodId = (order.pricingSnapshot as { paymentMethodId?: string } | null)?.paymentMethodId;
  const checkoutMethodLabel = checkoutMethodId
    ? findMethod(paymentCfg, checkoutMethodId)?.label ?? checkoutMethodId
    : null;

  return (
    <>
      <PageHeader
        icon={PackageIcon}
        title={order.fullName}
        subtitle={order.deploymentId}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ActivateCancelControls orderId={order.publicId} status={order.status} />
          </div>
        }
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

        <div className="space-y-4">
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

          <SectionCard title="Activity">
            <OrderActivityLog activities={activities} />
          </SectionCard>
        </div>
      </div>

      <SubscriptionPanel
        orderPublicId={order.publicId}
        monthParam={month}
        basePath={`/dashboard/orders/${order.publicId}`}
        visible={visible}
      />
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

        <div className="space-y-4">
          <SectionCard title="Payment">
            <Skeleton className="h-32 w-full" />
          </SectionCard>

          <SectionCard title="Activity">
            <OrderActivityLogSkeleton />
          </SectionCard>
        </div>
      </div>

      <SubscriptionPanelSkeleton />
    </>
  );
};
