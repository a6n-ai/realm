import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { PageHeader, PageShell } from "@realm/design-system";
import { TrackingView } from "@/components/order/tracking-view";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/auth/session";
import { loadTrackedOrder } from "@/lib/order-tracking/load";

export default async function CustomerOrderPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const session = await getSession();
  if (!session?.user) redirect(`/login?callbackUrl=/me/orders/${publicId}`);

  // Same grant the public /track page uses. An owner is granted without a PIN
  // because decideTrackingAccess matches the viewer against orders.user_id, so
  // this route needs no ownership check of its own — and must not invent a
  // second one that could disagree with it.
  const grant = await auth.api
    .getOrderTrackingGrant({ query: { orderId: publicId }, headers: await headers() })
    .catch(() => null);

  // Not theirs, or no such order. Both are a 404 here: a signed-in customer has
  // no business being told that someone else's order exists.
  if (!grant?.granted) notFound();

  const order = await loadTrackedOrder(publicId);
  if (!order) notFound();

  return (
    <PageShell>
      <PageHeader icon={PackageIcon} title={`Order ${order.reference}`} subtitle={order.fulfillment.summary} />
      <TrackingView order={order} />
    </PageShell>
  );
}
