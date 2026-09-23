import { inArray, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryCategorySwaps, mealSizeItems } from "@/db/schema";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { categoryPortionSlotsForMealSize, categoryPortionsForMealSize } from "@/lib/catalog/category-portions";
import { effectiveAddress } from "@/lib/services/deliveries.service";
import {
  makeupSourceIdsForOrder,
  myCalendar,
  myDeliveries,
  myDeliveryMeal,
  myPausePanel,
  myTiffinCounts,
  type Subscription,
} from "@/lib/services/customer-deliveries.service";
import {
  eatingDaysByDeliveryPublicId,
  loadTripEatingDays,
  type TripEatingDay,
} from "@/lib/services/trip-eating-days.service";

export type { TripEatingDay };

export async function loadOrderDeliveriesBundle(
  userId: bigint,
  selected: Subscription,
  from: string,
  until: string,
) {
  const [rawDeliveries, pausePanel, calendarDays, tiffinCounts, makeupSources, catalog] = await Promise.all([
    myDeliveries(userId, from, until),
    myPausePanel(userId, selected.publicId),
    myCalendar(userId, selected.publicId, { from, until }),
    myTiffinCounts(userId, selected.publicId),
    makeupSourceIdsForOrder(selected.publicId),
    loadCatalogSnapshot(),
  ]);

  const calendarCells = {
    [selected.publicId]: calendarDays,
  };

  const categoryRows = await dishCategoriesService.forPlanType(selected.planType);
  const categoryLabels: Record<string, string> = {};
  for (const r of categoryRows) categoryLabels[r.key] = r.label;
  const categoryPortions = categoryPortionsForMealSize(catalog.mealSizes, selected.mealSizeId);
  const categoryPortionSlots = categoryPortionSlotsForMealSize(catalog.mealSizes, selected.mealSizeId);

  const selectedDeliveries = rawDeliveries.filter((d) => d.orderPublicId === selected.publicId);

  // Same batch-load shape as MyDeliveriesData (app/(customer)/me/deliveries/page.tsx) —
  // this bundle backs both the customer-facing calendar reuse points and the admin
  // order-detail view, so both must see (and staff must be able to act on) the same
  // swap state. Eligibility is global (category_swap_pairs), gated per meal size by
  // swapPairsForMealSize — the same check applyDeliverySwap runs.
  const mealSizeCategoryRows = await db.select({ category: mealSizeItems.category }).from(mealSizeItems)
    .where(eq(mealSizeItems.mealSizeId, selected.mealSizeId));
  const mealSizeCategories = [...new Set(mealSizeCategoryRows.map((r) => r.category))];
  const swapPairs = await dishCategoriesService.swapPairsForMealSize(selected.mealSizeId);

  const allAppliedSwaps = selectedDeliveries.length === 0 ? [] : await db
    .select({
      publicId: deliveryCategorySwaps.publicId,
      deliveryId: deliveryCategorySwaps.deliveryId,
      fromCategory: deliveryCategorySwaps.fromCategory,
      toCategory: deliveryCategorySwaps.toCategory,
      qtyFrom: deliveryCategorySwaps.qtyFrom,
      qtyTo: deliveryCategorySwaps.qtyTo,
      forDate: deliveryCategorySwaps.forDate,
    })
    .from(deliveryCategorySwaps)
    .where(inArray(deliveryCategorySwaps.deliveryId, selectedDeliveries.map((d) => d.id)));

  const tripEating = selectedDeliveries.length === 0
    ? []
    : await loadTripEatingDays(
        selected.publicId,
        selectedDeliveries.map((d) => ({
          id: d.id,
          publicId: d.publicId,
          deliveryDate: d.deliveryDate,
          coversDates: d.coversDates,
          cutoffAt: d.cutoffAt,
        })),
      );
  const eatingByPublicId = eatingDaysByDeliveryPublicId(tripEating);

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
        eatingDays: eatingByPublicId.get(d.publicId) ?? [],
      };
    }),
  );

  return {
    deliveries,
    pausePanels: { [selected.publicId]: pausePanel },
    calendarCells,
    categoryLabels,
    categoryPortions,
    categoryPortionSlots,
    tiffinCounts,
  };
}
