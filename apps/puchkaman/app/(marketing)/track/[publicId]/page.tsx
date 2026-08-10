import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PageBanner } from "@/components/brutal/shared";
import { TrackingPinGate } from "@/components/order/tracking-pin-gate";
import { TrackingView } from "@/components/order/tracking-view";
import { auth } from "@/lib/auth";
import { loadTrackedOrder } from "@/lib/order-tracking/load";

// The whole page is a per-order, per-viewer read of live status — nothing here
// is cacheable, and a stale render would be a wrong answer.
export const dynamic = "force-dynamic";

// A tracking link is a capability. Keeping it out of search indexes is the
// cheapest way to make sure one pasted into a public forum does not get crawled.
export const metadata: Metadata = {
  title: "Track your order — Puchkaman",
  robots: { index: false, follow: false },
};

export default async function TrackOrderPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;

  const grant = await auth.api
    .getOrderTrackingGrant({ query: { orderId: publicId }, headers: await headers() })
    .catch(() => null);

  // Null means the plugin threw NOT_FOUND — an unknown id is a 404, not a
  // prompt, because there is nothing to guess at with a 71-bit id.
  if (!grant) notFound();

  if (!grant.granted) {
    return <TrackingPinGate orderId={publicId} />;
  }

  const order = await loadTrackedOrder(publicId);
  if (!order) notFound();

  return (
    <>
      <PageBanner
        kicker="Order status"
        title={`Order ${order.reference}`}
        sub={order.fulfillment.summary}
        crumb="Track order"
      />
      <TrackingView order={order} />
    </>
  );
}
