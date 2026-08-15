import { inArray, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categorySwapRules, deliveryCategorySwaps } from "@/db/schema";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
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

export async function loadOrderDeliveriesBundle(
  userId: bigint,
  selected: Subscription,
  from: string,
  until: string,
) {
  const [rawDeliveries, pausePanel, calendarDays, tiffinCounts, makeupSources] = await Promise.all([
    myDeliveries(userId, from, until),
    myPausePanel(userId, selected.publicId),
    myCalendar(userId, selected.publicId, { from, until }),
    myTiffinCounts(userId, selected.publicId),
    makeupSourceIdsForOrder(selected.publicId),
  ]);

  const calendarCells = {
    [selected.publicId]: calendarDays,
  };

  const categoryRows = await dishCategoriesService.forPlanType(selected.planType);
  const categoryLabels: Record<string, string> = {};
  for (const r of categoryRows) categoryLabels[r.key] = r.label;

  const selectedDeliveries = rawDeliveries.filter((d) => d.orderPublicId === selected.publicId);

  // Same batch-load shape as MyDeliveriesData (app/(customer)/me/deliveries/page.tsx) —
  // this bundle backs both the customer-facing calendar reuse points and the admin
  // order-detail view, so both must see (and staff must be able to act on) the same
  // swap state.
  const availableSwapRules = await db
    .select({
      publicId: categorySwapRules.publicId,
      fromCategory: categorySwapRules.fromCategory,
      toCategory: categorySwapRules.toCategory,
      qtyFrom: categorySwapRules.qtyFrom,
      qtyTo: categorySwapRules.qtyTo,
    })
    .from(categorySwapRules)
    .where(eq(categorySwapRules.mealSizeId, selected.mealSizeId));

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
        availableSwapRules,
        appliedSwaps: allAppliedSwaps.filter((s) => s.deliveryId === d.id),
      };
    }),
  );

  return {
    deliveries,
    pausePanels: { [selected.publicId]: pausePanel },
    calendarCells,
    categoryLabels,
    tiffinCounts,
  };
}
