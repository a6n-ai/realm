/* eslint-disable react-hooks/purity */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { EyeIcon, PackageIcon } from "lucide-react";
import { NotFoundError, formatMoney as fmt, zonedDateIso } from "@foundry/commons";
import { eq } from "drizzle-orm";
import { enabledMethods, findMethod } from "@foundry/payments";
import { after } from "next/server";
import { expireUnpaidStripeOrders } from "@/lib/services/stripe-expiry";
import { mealSizeAddons } from "@/lib/catalog/types";
import { requireStaff, roleCan } from "@/lib/auth/guards";
import { settleStaleOnView } from "@/lib/services/payment-stripe";
import { getSession } from "@/lib/auth/session";
import { readOrder, listOrderActivities, resolveSessionVisibleOrgIds, getClaimPaymentContext, ordersService } from "@/lib/services/orders.service";
import { appToday } from "@/lib/services/start-date";
import { earliestNewPlanStart, runningPlans } from "@/lib/services/order-window";
import { orderTiffinCounts } from "@/lib/services/customer-deliveries.service";
import { earliestTrialIso } from "@/lib/trial/schedule";
import { nextWeekday } from "@foundry/commons";
import { canTakeAddonPayment, complimentaryBlocker, orderDisplayStatus } from "@/lib/orders/display-status";
import { listDeliveries } from "@/lib/services/deliveries.service";
import { lapseElapsedPausesSafe } from "@/lib/services/pause-days.service";
import { isOrderFullyPaused } from "@/lib/services/pause-state";
import { getPauseLimits, getPauseUsage } from "@/lib/services/pause-limits.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { getAppSettings, getPaymentConfig } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { db } from "@/db/client";
import { deliveryZones, plans, users } from "@/db/schema";
import { ORDER_STATUS_LABEL, PageHeader, PageShell, SectionCard } from "@/components/ds";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import Link from "next/link";
import { humanDate } from "@/lib/deliveries-view";
import { formatEpoch } from "@/lib/format/datetime";
import { projectedEndDate, tripsFor } from "@/lib/orders/bounded-deliveries";
import { orderDeliveryDays, type DayOfWeek } from "@/lib/menu/delivery-days";
import type { OrderPricingSnapshot } from "@/lib/pricing/types";
import { Skeleton } from "@foundry/ui/skeleton";
import { payLink } from "@/lib/payments/stripe";
import { PaymentsPanel } from "./payments-panel";
import { OrderOverview } from "./order-summary-panel";
import { OrderTabs } from "./order-tabs";
import { ActivateCancelControls } from "./activate-cancel-controls";
import { AddAddonsControl } from "./add-addons-control";
import { StartDateControl } from "./start-date-control";
import { EatingDaysControl } from "./eating-days-control";
import { ComplimentaryControl } from "./complimentary-control";
import { LookOutControl } from "./look-out-control";
import { RenewControl } from "./renew-control";
import { TrialPill } from "../trial-pill";
import { OrderActivityLog } from "./order-activity-log";
import { DeliveriesSection, DeliveriesSectionSkeleton, loadSubscription } from "@/components/dashboard/deliveries-section";
import { TabSkeleton } from "./tab-skeleton";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { stageCards } from "./stage-cards";

// The full record for ONE order: what it is, what it costs, whether it is paid, and every
// change the customer can make on it (move, swap, address, meal picks) through
// the same server actions, so staff can do it for them. Tabs keep each concern one click away.

type SearchParams = Promise<{ week?: string; free?: string }>;

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
  const { week, free } = await searchParams;

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

  // A paused day past its cutoff is a hold: convert it (under the order lock) before the page reads any delivery.
  if (order.status === "active" || order.status === "paused") await lapseElapsedPausesSafe(order.id);

  const [activities, settings, planRow, customer, paymentCfg, deliveryRows, zone, lookOutBy] = await Promise.all([
    listOrderActivities(order.id),
    settingsP,
    db.select({ planType: plans.planType, allowedStartDays: plans.allowedStartDays }).from(plans).where(eq(plans.id, order.planId)).limit(1).then((r) => r[0]),
    order.userId != null
      ? db
          .select({ publicId: users.publicId, name: users.name, email: users.email, phone: users.phone, stripeCustomerId: users.stripeCustomerId })
          .from(users)
          .where(eq(users.id, order.userId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    getPaymentConfig(),
    listDeliveries(order.id),
    order.zoneId != null
      ? db.select({ name: deliveryZones.name }).from(deliveryZones).where(eq(deliveryZones.id, order.zoneId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    order.lookOutBy != null
      ? db.select({ name: users.name }).from(users).where(eq(users.id, order.lookOutBy)).limit(1).then((r) => r[0]?.name ?? null)
      : Promise.resolve(null),
  ]);

  // Lazy status check on view (no cron): settle card payments the webhook may have missed.
  const unsettledCards = order.payments.filter((p) => p.method === "stripe" && p.status === "awaiting_payment" && p.providerRef);
  if (unsettledCards.length) after(() => settleStaleOnView(unsettledCards));
  after(() => expireUnpaidStripeOrders({ orderId: order.id }));
  const role = session?.user.role ?? "";

  const settingsToday = zonedDateIso(Date.now(), settings.timezone);
  const fullyPaused = (order.status === "active" || order.status === "paused") && (await isOrderFullyPaused(db, order.id, settingsToday));
  const optimoRows = deliveryRows
    .filter((r) => r.deliveryDate >= settingsToday && r.status !== "cancelled")
    .map((r) => ({
      publicId: r.publicId,
      deliveryDate: r.deliveryDate,
      status: r.status,
      routeDriverName: r.routeDriverName,
      routeSyncedAt: r.routeSyncedAt,
    }));

  const planType = (planRow?.planType ?? "tiffin") as "tiffin" | "healthy";
  // Second wave: everything below needs only order/planRow, so run it together
  // instead of five sequential round trips.
  const migratedWaiting = order.deploymentId.startsWith("wc-") && order.status === "pending";
  const claimContexts: Record<string, NonNullable<Awaited<ReturnType<typeof getClaimPaymentContext>>>> = {};
  // Ended plans get no subscription week, so their counts come straight from the delivery rows.
  const ended = order.status === "completed" || order.status === "cancelled";
  const running = order.status === "active" || order.status === "paused";
  const [categoryRows, catalogSnapshot, , sub, startBlocker, otherPlanEnd, endedCounts, customerPlans, holds] = await Promise.all([
    dishCategoriesService.forPlanType(planType),
    loadCatalogSnapshot(order.organizationId),
    // Staff-on-behalf claim form for payments that still need a reference/screenshot.
    Promise.all(
      order.payments
        .filter((p) => !p.addonRequest && (p.status === "awaiting_payment" || p.status === "rejected"))
        .map(async (p) => {
          const ctx = await getClaimPaymentContext(p.publicId);
          if (ctx) claimContexts[p.publicId] = ctx;
        }),
    ),
    loadSubscription(order, week),
    // A WordPress plan waiting to start has its own Start plan flow.
    migratedWaiting
      ? "Use Start plan to set when this WordPress plan begins"
      : ordersService.startChangeBlocker(order.id, order.status),
    // Moving the start must not land inside another running plan of this customer.
    order.userId != null ? earliestNewPlanStart(db, order.userId, order.id) : null,
    ended ? orderTiffinCounts(order.publicId) : null,
    order.userId != null ? runningPlans(db, order.userId) : [],
    running
      ? Promise.all([getPauseUsage(order.id), getPauseLimits(order.id)]).then(([u, l]) => ({ daysUsed: u.daysUsed, maxDays: l.maxPauseDaysTotal }))
      : null,
  ]);
  // The customer's other running plans: a renewal's days sit on its own order, not this one.
  // Only plans in organizations this staff member can see: a customer can hold plans in several.
  const otherPlans = customerPlans.filter((p) => p.publicId !== order.publicId
    && (visible === "all" || (p.organizationId != null && visible.includes(p.organizationId))));
  const categoryLabels = Object.fromEntries(categoryRows.map((c) => [c.key, c.label]));
  const checkoutMethodId = (order.pricingSnapshot as { paymentMethodId?: string } | null)?.paymentMethodId;
  const checkoutMethodLabel = checkoutMethodId
    ? findMethod(paymentCfg, checkoutMethodId)?.label ?? checkoutMethodId
    : null;


  const counts = sub.week?.plan.counts ?? endedCounts;
  // Today's drop counts until the driver confirms it; a merged-away or empty row never ships.
  const next = deliveryRows
    .filter((r) => r.deliveryDate >= settingsToday && r.status === "scheduled" && r.optimoCompletionStatus !== "success"
      && r.tiffinUnits > 0 && r.mergedIntoDeliveryId == null)
    .sort((x, y) => x.deliveryDate.localeCompare(y.deliveryDate))[0];
  const paid = order.payments
    .filter((p) => p.status === "paid" || p.status === "simulated_paid")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const due = Math.max(Number(order.total) - paid, 0);
  const toReview = order.payments.filter((p) => p.status === "pending_verification").length;
  const pendingPay = order.payments.find((p) => p.status === "pending_verification");
  const displayStatus = orderDisplayStatus(order.status, order.payments.filter((p) => !p.addonRequest).map((p) => p.status));

  // A WordPress-imported plan waiting to be started: where WordPress left off, and when the
  // balance runs out if it starts on its next due date.
  const migratedPending = order.status === "pending" && order.deploymentId.startsWith("wc-");
  const addonOptions = mealSizeAddons(catalogSnapshot).map((a) => ({
    key: a.key,
    name: a.name,
    pricePerTiffin: a.pricePerTiffin,
    maxQty: a.maxQty,
    existingQty: order.addons.filter((x) => x.key === a.key).reduce((s, x) => s + x.qty, 0),
  }));
  const addonMethods = enabledMethods(paymentCfg)
    .filter((m) => m.id !== "simulated")
    .map((m) => ({ id: m.id, label: m.label, requireProof: m.requireProof === true }));
  const customMealSize = catalogSnapshot.mealSizes.find((m) => m.id === order.mealSizeId)?.custom === true;
  const canAddAddons = order.trialLength == null && !customMealSize && (order.status === "active" || order.status === "paused")
    && canTakeAddonPayment(order, order.payments) == null;
  const frequencyKey = catalogSnapshot.frequencies.find((f) => f.id === order.frequencyId)?.key ?? null;
  const migration = migratedPending && frequencyKey
    ? {
        frequencyKey,
        eatingDays: (order.eatingDays ?? []) as DayOfWeek[],
        persons: order.persons,
        tiffinCount: order.tiffinCount,
        startDate: order.startDate,
        wordpress: (order.pricingSnapshot as OrderPricingSnapshot | null)?.wordpress ?? null,
      }
    : null;
  const projectedEnd = migration
    ? projectedEndDate({ startDate: migration.startDate, trips: tripsFor(migration.frequencyKey, migration.eatingDays), persons: migration.persons, targetTiffinCount: migration.tiffinCount })
    : null;

  const notStarted = startBlocker == null;
  const startDays = order.trialLength != null ? (order.trialWeekdays ?? []) : (planRow?.allowedStartDays ?? []);
  const startToday = appToday(settings.timezone, settings.cutoffHour);
  const startAction = (
    <StartDateControl
      blockedReason={startBlocker}
      orderId={order.publicId}
      startDate={order.startDate}
      minDate={order.trialLength != null ? earliestTrialIso(startToday, startDays) : nextWeekday(startToday).toISOString().slice(0, 10)}
      otherPlanEnd={otherPlanEnd}
      allowedDays={startDays}
    />
  );

  const frequencyRow = catalogSnapshot.frequencies.find((f) => f.id === order.frequencyId);
  // Saving eating days moves a WordPress plan imported as MWF onto the 5-day route (changeEatingDays).
  const deliveryRow = order.deploymentId.startsWith("wc-") ? catalogSnapshot.frequencies.find((f) => f.key === "5_day") ?? frequencyRow : frequencyRow;
  const canEditEating = frequencyRow != null && order.trialLength == null
    && (order.status === "active" || order.status === "paused" || order.status === "pending");
  const eatingAction = canEditEating ? (
    <EatingDaysControl
      orderId={order.publicId}
      eatingDays={(order.eatingDays as DayOfWeek[] | null) ?? orderDeliveryDays({
        frequencyKey: frequencyRow.key, weekdays: frequencyRow.weekdays as DayOfWeek[] | null,
        includeSaturday: order.includeSaturday, includeSunday: order.includeSunday,
      })}
      deliveryDays={orderDeliveryDays({ frequencyKey: deliveryRow!.key, weekdays: deliveryRow!.weekdays as DayOfWeek[] | null, includeSaturday: false, includeSunday: false })}
      toFiveDay={deliveryRow !== frequencyRow}
      servesWeekends={catalogSnapshot.mealSizes.find((m) => m.id === order.mealSizeId)?.servesWeekends ?? true}
      bounds={{ min: settings.minTiffinsPerWeek, max: settings.maxTiffinsPerWeek }}
    />
  ) : null;

  const compensated = new Set(deliveryRows.map((r) => r.complimentaryForDeliveryId).filter((id) => id != null).map(String));
  // A plan closes on dates alone; a past day OptimoRoute never confirmed is what its "left" count
  // still holds. Same rule as the Missed deliveries list, so staff settle it there.
  const unconfirmed = order.status === "completed"
    ? deliveryRows.filter((r) => r.status === "scheduled" && r.deliveryDate < settingsToday && r.optimoCompletionStatus !== "success"
      && r.tiffinUnits > 0 && r.mergedIntoDeliveryId == null && !compensated.has(String(r.id)))
    : [];
  const unconfirmedUnits = unconfirmed.reduce((n, r) => n + r.tiffinUnits, 0);

  // Same rule as lastTiffinSql on the orders list: the last day that was not cancelled.
  const lastTiffin = deliveryRows.filter((r) => r.status !== "cancelled").map((r) => r.deliveryDate).sort().at(-1) ?? null;
  const cancelledAt = activities.find((a) => a.type === "cancelled")?.createdAt;
  const renewal = otherPlans.filter((p) => p.startDate > order.startDate).sort((x, y) => x.startDate.localeCompare(y.startDate))[0];
  const stats = stageCards({
    displayStatus,
    statusLabel: ORDER_STATUS_LABEL[displayStatus] ?? displayStatus,
    status: order.status,
    frequencyName: order.frequencyName,
    fullyPaused,
    notStarted,
    today: settingsToday,
    startDate: order.startDate,
    createdOn: zonedDateIso(order.createdAt, settings.timezone),
    meal: `${order.planName} · ${order.mealSizeName}`,
    zoneName: zone?.name ?? null,
    tiffinCount: order.tiffinCount,
    complimentaryTiffins: order.complimentaryTiffins,
    persons: order.persons,
    counts,
    next: next ? { date: next.deliveryDate, driver: next.routeDriverName } : null,
    lastTiffin,
    unconfirmed: { units: unconfirmedUnits, dates: unconfirmed.map((r) => r.deliveryDate).sort() },
    renewal: renewal ? { deploymentId: renewal.deploymentId, startDate: renewal.startDate } : null,
    holds,
    money: {
      paid,
      total: Number(order.total),
      due,
      refunded: order.payments.filter((p) => p.status === "refunded").reduce((n, p) => n + Number(p.amount), 0),
      toReview,
    },
    cancelledOn: cancelledAt != null ? zonedDateIso(Number(cancelledAt), settings.timezone) : null,
    fmt: (n) => fmt(n, settings.currency),
    day: humanDate,
  });

  // Past deliveries a free tiffin can make up for, newest first, minus ones that already have one.
  // Any status but cancelled: a driver can mark a stop delivered that the customer never got.
  const deliveryState = (r: (typeof deliveryRows)[number]) =>
    r.holidayId != null && r.status !== "scheduled" ? "closed for a holiday"
    : r.status === "paused" ? "paused"
    : r.status === "skipped" ? (r.optimoCompletionStatus === "failed" ? "not delivered" : "on hold")
    : r.optimoCompletionStatus === "success" ? "marked delivered"
    : "not confirmed";
  const missedOptions = deliveryRows
    .filter((r) => r.deliveryDate <= settingsToday && r.status !== "cancelled" && r.mergedIntoDeliveryId == null && !compensated.has(String(r.id)))
    .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate))
    .map((r) => ({ publicId: r.publicId, label: `${humanDate(r.deliveryDate)} · ${deliveryState(r)}` }));
  // Admin only; a trial, a payment-pending or a cancelled plan can't get one (grantComplimentaryTiffin enforces it too).
  const canGiveFree = session?.user?.role === "admin" && order.trialLength == null
    && complimentaryBlocker(order.status, order.payments.filter((p) => !p.addonRequest).map((p) => p.status)) == null;
  const headerActions = (
    <>
      {order.trialLength != null && <TrialPill className="self-center" />}
      {order.lookOutAt == null && <LookOutControl orderId={order.publicId} />}
      {["active", "paused", "completed"].includes(order.status) && order.trialLength == null && !renewal && <RenewControl orderId={order.publicId} />}
      <ActivateCancelControls orderId={order.publicId} status={order.status} migrated={order.deploymentId.startsWith("wc-")} paidPending={!order.deploymentId.startsWith("wc-") && order.payments.some((p) => p.method === "stripe" && p.status === "paid")} migration={migration} />
      {canAddAddons && (
        <AddAddonsControl
          orderId={order.publicId}
          options={addonOptions}
          methods={addonMethods}
          defaultMethodId={checkoutMethodId ?? null}
          currency={settings.currency}
        />
      )}
      {canGiveFree && (
        <ComplimentaryControl
          orderId={order.publicId}
          ended={order.status === "completed"}
          minDate={nextWeekday(startToday).toISOString().slice(0, 10)}
          allowedDays={(counts?.deliveryWeekdays ?? []).filter((d) => d !== "sat" && d !== "sun")}
          otherPlanEnd={otherPlanEnd}
          missed={missedOptions}
          initialForId={free ?? null}
        />
      )}
    </>
  );

  return (
    <>
      <PageHeader
        icon={PackageIcon}
        title={order.fullName}
        subtitle={`Order ${order.deploymentId} · ${order.planName} · ${order.mealSizeName}`}
        actions={<div className="hidden flex-wrap items-center justify-end gap-2 sm:flex">{headerActions}</div>}
      />
      {/* Phones: actions get their own row so the name keeps the full width. */}
      <div className="-mt-2 flex flex-wrap gap-2 sm:hidden">{headerActions}</div>

      <StatCards items={stats} />

      {otherPlans.length > 0 && (
        <p data-testid="other-plans" className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {otherPlans.map((p) => (
            <span key={p.publicId}>
              {p.startDate > order.startDate ? "Renewal" : "Earlier plan"}{" "}
              <Link href={`/dashboard/orders/${p.publicId}`} className="text-foreground font-medium hover:underline">{p.deploymentId}</Link>
              {` · ${humanDate(p.startDate)} – ${humanDate(p.lastDelivery ?? p.lastDay)} · ${p.tiffinCount} tiffins`}
            </span>
          ))}
        </p>
      )}

      {order.lookOutAt != null && (
        <div role="status" data-testid="look-out-banner" className="border-warn/40 bg-warn/10 flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-sm">
          <EyeIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Look out for this order</p>
            {/* The note is the point of the flag: its own line, not buried in the byline. */}
            <p data-testid="look-out-note" className={order.lookOutNote ? "text-foreground my-1 whitespace-pre-line text-base text-pretty" : "text-muted-foreground"}>
              {order.lookOutNote ?? "No note was added."}
            </p>
            <p className="text-muted-foreground text-xs">
              Marked{lookOutBy ? ` by ${lookOutBy}` : ""} on {formatEpoch(order.lookOutAt, { mode: "date", timeZone: settings.timezone })}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <LookOutControl orderId={order.publicId} flaggedNote={order.lookOutNote ?? ""} />
          </div>
        </div>
      )}

      {migration && (
        <div role="status" className="border-primary/40 bg-primary/5 rounded-xl border px-4 py-3 text-sm">
          <p className="font-medium">
            Imported from WordPress{migration.wordpress ? ` order #${migration.wordpress.orderId}` : ""}. Waiting to be started.
          </p>
          <p className="text-muted-foreground">
            {migration.wordpress?.lastDeliveredDate
              ? `WordPress last delivered ${humanDate(migration.wordpress.lastDeliveredDate)} (${migration.wordpress.deliveredCount} boxes). `
              : "WordPress has not delivered yet. "}
            {migration.tiffinCount} tiffins left · next due {humanDate(migration.startDate)}
            {projectedEnd ? ` · ends ${humanDate(projectedEnd)}` : ""}
            {migration.wordpress ? ` · balance as of ${humanDate(migration.wordpress.refreshedOn)}` : ""}
          </p>
        </div>
      )}

      {pendingPay && (
        <div role="status" className="border-warn/40 bg-warn/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <div className="min-w-0 text-sm">
            <p className="font-medium">Payment awaiting approval</p>
            <p className="text-muted-foreground">
              {fmt(Number(pendingPay.amount), settings.currency)}
              {pendingPay.method === "etransfer" ? " by e-Transfer" : ""}
              {pendingPay.reference ? ` · ref ${pendingPay.reference}` : ""}
              {pendingPay.proofThumbUrl ? " · screenshot attached" : ""}
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="?tab=payments" scroll={false}>Review payment</Link>
          </Button>
        </div>
      )}

      <OrderTabs
        badges={toReview ? { payments: <Badge variant="secondary" className="h-5 px-1.5 tabular-nums">{toReview}</Badge> } : undefined}
        panels={{
          overview: (
            <OrderOverview
              order={order}
              customer={customer}
              zoneName={zone?.name ?? null}
              timezone={settings.timezone}
              currency={settings.currency}
              categoryLabels={categoryLabels}
              startAction={startAction}
              eatingAction={eatingAction}
            />
          ),
          deliveries: (
            <>
              <DeliveriesSection data={sub} routing={sub.paymentReview ? [] : optimoRows} />
            </>
          ),
          payments: (
            <SectionCard title="Payments" subtitle="Verify or reject claims, and share the pay link with the customer.">
              <PaymentsPanel
                orderId={order.publicId}
                deploymentId={order.deploymentId}
                orderTotal={Number(order.total)}
                currency={settings.currency}
                timezone={settings.timezone}
                checkoutMethodLabel={checkoutMethodLabel}
                pricingSnapshot={order.pricingSnapshot}
                payments={order.payments}
                payLinks={Object.fromEntries(order.payments.filter((p) => p.method === "stripe").map((p) => [p.publicId, payLink(p.publicId)]))}
                now={Date.now()}
                claimContexts={claimContexts}
                canCheck={roleCan(role, { finance: ["read"] })}
                canRefund={roleCan(role, { finance: ["refund"] })}
                canCharge={roleCan(role, { finance: ["charge"] }) && !!customer?.stripeCustomerId}
              />
            </SectionCard>
          ),
          activity: (
            <SectionCard title="Activity" subtitle="Every change on this order, by staff, the customer or the system.">
              <OrderActivityLog activities={activities} />
            </SectionCard>
          ),
        }}
      />
    </>
  );
}

OrderDetail.Skeleton = function OrderDetailSkeleton() {
  return (
    <>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <StatCardsSkeleton count={5} />
      <Skeleton className="h-9 w-full max-w-md" />
      <TabSkeleton
        deliveries={<DeliveriesSectionSkeleton />}
        overview={
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <SectionCard key={i} title={i === 0 ? "Plan & schedule" : "Customer & delivery"}>
                <div className="space-y-3">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <Skeleton key={j} className="h-4 w-full" />
                  ))}
                </div>
              </SectionCard>
            ))}
          </div>
        }
      />
    </>
  );
};
