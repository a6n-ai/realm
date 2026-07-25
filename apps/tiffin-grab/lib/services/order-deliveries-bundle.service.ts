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
