import { SectionCard } from "@/components/ds";
import { can } from "@/lib/auth/guards";
import { inStatuses, UNPAID } from "@/lib/payments/status";
import { getClaimPaymentContext, type ClaimPaymentContext } from "@/lib/payments/verification";
import { payLink } from "@/lib/payments/stripe";
import { requestNow } from "@/lib/dates/request-now";
import type { readOrder } from "@/lib/orders/orders.service";
import { PaymentsPanel } from "./payments-panel";

/** Finance data only: rendered inside `<Can perms={{ finance: ["read"] }}>`, so the claim lookups run only for finance viewers. */
export async function PaymentsSection({
  order,
  currency,
  timezone,
  checkoutMethodLabel,
  hasStripeCustomer,
}: {
  order: Awaited<ReturnType<typeof readOrder>>;
  currency: string;
  timezone: string;
  checkoutMethodLabel: string | null;
  hasStripeCustomer: boolean;
}) {
  // Staff-on-behalf claim form for payments that still need a reference/screenshot.
  const claimContexts: Record<string, ClaimPaymentContext> = {};
  await Promise.all(
    order.payments
      .filter((p) => !p.addonRequest && inStatuses(UNPAID, p.status))
      .map(async (p) => {
        const ctx = await getClaimPaymentContext(p.publicId);
        if (ctx) claimContexts[p.publicId] = ctx;
      }),
  );

  return (
    <SectionCard title="Payments" subtitle="Verify or reject claims, and share the pay link with the customer.">
      <PaymentsPanel
        orderId={order.publicId}
        deploymentId={order.deploymentId}
        orderTotal={Number(order.total)}
        currency={currency}
        timezone={timezone}
        checkoutMethodLabel={checkoutMethodLabel}
        pricingSnapshot={order.pricingSnapshot}
        payments={order.payments}
        payLinks={Object.fromEntries(order.payments.filter((p) => p.method === "stripe").map((p) => [p.publicId, payLink(p.publicId)]))}
        now={requestNow()}
        claimContexts={claimContexts}
        canCheck={await can({ finance: ["charge"] })}
        canRefund={await can({ finance: ["refund"] })}
        canCharge={(await can({ finance: ["charge"] })) && hasStripeCustomer}
      />
    </SectionCard>
  );
}
