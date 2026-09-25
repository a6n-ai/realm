import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryCategorySwaps, orderActivities, orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { materializeDeliveries } from "../deliveries.service";

// Monday, far enough out that no cutoff has passed. Mon trip [21,22]-style: Mon+Tue, Wed+Thu, Fri+Sat+Sun.
export const MON = "2030-01-07";

export async function resetTrips(deploymentId: string, userPrefix: string) {
  const mine = await db.select({ id: orders.id }).from(orders).where(eq(orders.deploymentId, deploymentId));
  const ids = mine.map((o) => o.id);
  if (ids.length) {
    const dl = await db.select({ id: deliveries.id }).from(deliveries).where(inArray(deliveries.orderId, ids));
    if (dl.length) await db.delete(deliveryCategorySwaps).where(inArray(deliveryCategorySwaps.deliveryId, dl.map((d) => d.id)));
    await db.delete(orderActivities).where(inArray(orderActivities.orderId, ids));
    // makeup / merge links are self-references: clear before deleting
    await db.update(deliveries).set({ makeupForDeliveryId: null, mergedIntoDeliveryId: null }).where(inArray(deliveries.orderId, ids));
    await db.delete(deliveries).where(inArray(deliveries.orderId, ids));
    await db.delete(payments).where(inArray(payments.orderId, ids));
    await db.delete(orders).where(inArray(orders.id, ids));
  }
  await db.delete(users).where(like(users.email, `${userPrefix}%@test.invalid`));
}

/** MWF order eating all 7 days for 1 week from MON, materialized: Mon [Mon,Tue], Wed [Wed,Thu], Fri [Fri,Sat,Sun]. */
export async function makeTripOrder(
  deploymentId: string,
  userPrefix: string,
  persons = 1,
  frequencyKey: "mwf" | "5_day" = "mwf",
  durationWeeks = 1,
  eating: { days: DayOfWeek[]; tiffinCount: number } | null = null,
) {
  const snap = await loadCatalogSnapshot();
  const vegPlanId = snap.plans.find((p) => p.key === "veg")!.id;
  // A meal size scoped to the veg plan specifically — snap.mealSizes[0] isn't
  // guaranteed to be one, and allowedDishIdsForMealSize derives eligible dishes
  // from THIS meal size's own composition rows, not order.planId alone.
  const vegMealSize = snap.mealSizes.find((m) => m.key === "small_thali") ?? snap.mealSizes.find((m) => m.planId === vegPlanId)!;
  const [u] = await db.insert(users).values({ email: `${userPrefix}${Math.random().toString(36).slice(2)}@test.invalid`, role: "user" }).returning();
  const [o] = await db.insert(orders).values({
    userId: u.id,
    planId: vegPlanId,
    mealSizeId: vegMealSize.id,
    frequencyId: snap.frequencies.find((f) => f.key === frequencyKey)!.id,
    persons,
    mealSlots: ["lunch"],
    categoryCounts: { sabzi: 1 },
    eatingDays: eating?.days ?? ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    durationWeeks,
    startDate: MON,
    tiffinCount: eating?.tiffinCount ?? 7 * persons * durationWeeks,
    perTiffinPrice: "10.00",
    pricingSnapshot: {},
    total: "70.00",
    status: "active",
    deploymentId,
    fullName: "Trip Tester",
    addressLine: "9 Bay St",
    city: "Toronto",
    postalCode: "M5J 2T3",
  }).returning();
  await db.insert(payments).values({
    orderId: o.id,
    amount: "70.00",
    method: "simulated",
    status: "paid",
  });
  await db.transaction((tx) => materializeDeliveries(tx, o));
  const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id));
  const byDate = (d: string) => rows.find((r) => r.deliveryDate === d)!;
  return { order: o, mon: byDate("2030-01-07"), wed: byDate("2030-01-09"), fri: byDate("2030-01-11") };
}
