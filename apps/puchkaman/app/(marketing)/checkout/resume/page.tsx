import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageBanner } from "@/components/brutal/shared";
import { ResumeCheckoutClient } from "@/components/order/resume-checkout-client";
import { verifyResumeToken } from "@/lib/recovery/token";
import { ordersService } from "@/lib/services/orders.service";
import { buildMetadata } from "@/lib/seo";

// A resume link carries live payment capability — never cacheable, never indexed.
export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Resume payment | Puchkaman",
  description: "Finish paying for your Puchkaman order.",
  path: "/checkout/resume",
  noIndex: true,
});

export default async function ResumeCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; t?: string }>;
}) {
  const { order: orderPublicId, t } = await searchParams;
  // One 404 for every failure mode — expired, tampered, wrong order, already
  // paid, unknown order. Distinguishing them tells an attacker which orders exist.
  if (!orderPublicId || !t || !verifyResumeToken(orderPublicId, t)) notFound();

  const order = await ordersService.getResumableCheckout(orderPublicId);
  if (!order) notFound();

  return (
    <>
      <PageBanner
        kicker="Almost there"
        title={`Order ${order.orderPublicId}`}
        sub="Finish paying to send this order to the kitchen."
        crumb="Resume payment"
      />
      <div className="wrap" style={{ padding: "40px 20px 72px", maxWidth: 520 }}>
        <ResumeCheckoutClient order={order} />
      </div>
    </>
  );
}
