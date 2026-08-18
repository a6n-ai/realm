import { Suspense } from "react";
import { redirect } from "next/navigation";
import { inArray, eq } from "drizzle-orm";
import { zonedDateIso } from "@realm/commons";
import { db } from "@/db/client";
import { deliveryCategorySwaps, mealSizeItems } from "@/db/schema";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import {
  myActiveSubscriptions,
  myCalendar,
  myDeliveries,
  myDeliveryMeal,
  myPausePanel,
  myPrimarySubscription,
  myTiffinCounts,
  myWaitlistedSubscriptions,
  makeupSourceIdsForOrder,
} from "@/lib/services/customer-deliveries.service";
import { effectiveAddress } from "@/lib/services/deliveries.service";
import { monthFetchRange, parseMonthParam, type CalendarCell } from "./calendar-constants";
import { DeliveryCalendar, DeliveryCalendarSkeleton } from "./delivery-calendar";

type SearchParams = Promise<{ month?: string; sub?: string }>;

export default function MyDeliveriesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<DeliveryCalendarSkeleton />}>
      <MyDeliveriesData searchParams={searchParams} />
    </Suspense>
  );
}

async function MyDeliveriesData({ searchParams }: { searchParams: SearchParams }) {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");

  const { month: monthParam, sub: subParam } = await searchParams;

  const { timezone } = await getAppSettings();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const today = zonedDateIso(Date.now(), timezone);
  const monthKey = parseMonthParam(monthParam, today);
  const { from, until } = monthFetchRange(monthKey, today);

  const [subscriptions, waitlisted, primary] = await Promise.all([
    myActiveSubscriptions(userId),
    myWaitlistedSubscriptions(userId),
    myPrimarySubscription(userId),
  ]);

  if (subscriptions.length === 0 || !primary) {
    return (
      <DeliveryCalendar
        subscriptions={[]}
        deliveries={[]}
        pausePanels={{}}
        calendarCells={{}}
        categoryLabels={{}}
        monthKey={monthKey}
        waitlisted={waitlisted}
        today={today}
      />
    );
  }

  const selected =
    (subParam ? subscriptions.find((s) => s.publicId === subParam) : null) ?? primary;

  const [rawDeliveries, pausePanel, calendarDays, tiffinCounts, makeupSources] = await Promise.all([
    myDeliveries(userId, from, until),
    myPausePanel(userId, selected.publicId),
    myCalendar(userId, selected.publicId, { from, until }),
    myTiffinCounts(userId, selected.publicId),
    makeupSourceIdsForOrder(selected.publicId),
  ]);

  const calendarCells: Record<string, CalendarCell[]> = {
    [selected.publicId]: calendarDays,
  };

  const categoryRows = await dishCategoriesService.forPlanType(selected.planType);
  const categoryLabels: Record<string, string> = {};
  for (const r of categoryRows) categoryLabels[r.key] = r.label;

  const selectedDeliveries = rawDeliveries.filter((d) => d.orderPublicId === selected.publicId);

  // Eligibility is global now (category_swap_pairs) — restricted here to categories
  // this meal size actually offers, so the picker can't propose a pair it doesn't serve.
  const mealSizeCategoryRows = await db.select({ category: mealSizeItems.category }).from(mealSizeItems)
    .where(eq(mealSizeItems.mealSizeId, selected.mealSizeId));
  const mealSizeCategories = [...new Set(mealSizeCategoryRows.map((r) => r.category))];
  const swapPairs = await dishCategoriesService.swapPairsForCategories(mealSizeCategories);

  // One batched query for every delivery's applied swaps, not one per delivery inside
  // the Promise.all below — same batch-then-filter shape resolveDeliveryMealsForWeek uses.
  const allAppliedSwaps = selectedDeliveries.length === 0 ? [] : await db
    .select({
      publicId: deliveryCategorySwaps.publicId,
      deliveryId: deliveryCategorySwaps.deliveryId,
      fromCategory: deliveryCategorySwaps.fromCategory,
      toCategory: deliveryCategorySwaps.toCategory,
      qtyFrom: deliveryCategorySwaps.qtyFrom,
      qtyTo: deliveryCategorySwaps.qtyTo,
    })
    .from(deliveryCategorySwaps)
    .where(inArray(deliveryCategorySwaps.deliveryId, selectedDeliveries.map((d) => d.id)));

  const deliveries = await Promise.all(
    selectedDeliveries.map(async (d) => {
      const meal = await myDeliveryMeal(d);
      const hasAddressOverride = d.addressLine !== null;
      const address = effectiveAddress(d, selected);
      return {
        ...d,
        meal,
        address,
        hasAddressOverride,
        hasMakeupScheduled: makeupSources.has(d.id.toString()),
        swapPairs,
        mealSizeCategories,
        appliedSwaps: allAppliedSwaps.filter((s) => s.deliveryId === d.id),
      };
    }),
  );

  return (
    <DeliveryCalendar
      subscriptions={subscriptions}
      selectedPublicId={selected.publicId}
      deliveries={deliveries}
      pausePanels={{ [selected.publicId]: pausePanel }}
      calendarCells={calendarCells}
      categoryLabels={categoryLabels}
      monthKey={monthKey}
      waitlisted={waitlisted}
      today={today}
      tiffinCounts={tiffinCounts}
    />
  );
}
