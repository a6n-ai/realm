import { Suspense } from "react";
import { redirect } from "next/navigation";
import { parseIsoDateUtc, zonedDateIso } from "@realm/commons";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { myActiveSubscriptions, myDeliveries, myDeliveryMeal } from "@/lib/services/customer-deliveries.service";
import { effectiveAddress } from "@/lib/services/deliveries.service";
import { MAX_EXTRA_WINDOWS, WINDOW_DAYS } from "./calendar-constants";
import { DeliveryCalendar, DeliveryCalendarSkeleton } from "./delivery-calendar";

type SearchParams = Promise<{ days?: string }>;

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

  const { days } = await searchParams;
  // Extra 14-day windows beyond the first, requested via "Load more" (?days=N). Clamped so a
  // hand-edited URL can't force an unbounded read.
  const extraWindows = Math.min(Math.max(Number(days) || 0, 0), MAX_EXTRA_WINDOWS);

  const { timezone } = await getAppSettings();
  const today = zonedDateIso(Date.now(), timezone); // window start in APP tz, not server tz
  const untilDate = parseIsoDateUtc(today);
  untilDate.setUTCDate(untilDate.getUTCDate() + WINDOW_DAYS * (extraWindows + 1));
  const until = untilDate.toISOString().slice(0, 10);

  // Reads only — this page never calls reconcileMakeups/materializeDeliveries.
  const [subscriptions, rawDeliveries] = await Promise.all([
    myActiveSubscriptions(userId),
    myDeliveries(userId, today, until),
  ]);

  // myDeliveries doesn't join the order's own address columns (it only returns the delivery's
  // override columns), so the order's address — needed by effectiveAddress for the "inherit"
  // case where all four override columns are NULL — is threaded from the subscriptions list
  // already in hand, keyed by orderPublicId, rather than re-querying per row.
  const subscriptionByPublicId = new Map(subscriptions.map((s) => [s.publicId, s]));

  const deliveries = await Promise.all(
    rawDeliveries.map(async (d) => {
      const meal = await myDeliveryMeal(d);
      const hasAddressOverride = d.addressLine !== null;
      const subscription = subscriptionByPublicId.get(d.orderPublicId);
      const address = subscription
        ? effectiveAddress(d, subscription)
        : { fullName: "", addressLine: "", city: "", postalCode: "", zoneId: null };
      return { ...d, meal, address, hasAddressOverride };
    }),
  );

  return <DeliveryCalendar subscriptions={subscriptions} deliveries={deliveries} extraWindows={extraWindows} />;
}
