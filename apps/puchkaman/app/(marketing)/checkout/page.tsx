import type { Metadata } from "next";
import { Btn, PageBanner } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";
import { CheckoutClient } from "@/components/order/checkout-client";
import { OrderingUnavailableNotice } from "@/components/order/ordering-unavailable";
import { isPublicOrderingEnabled } from "@/lib/clover/public-ordering";
import { buildMetadata } from "@/lib/seo";

// Never indexable — transactional, per-session, and shouldn't be crawlable.
export const metadata: Metadata = buildMetadata({
  title: "Checkout | Puchkaman",
  description: "Complete your Puchkaman pickup order.",
  path: "/checkout",
  noIndex: true,
});

export default async function CheckoutPage() {
  const orderingEnabled = await isPublicOrderingEnabled();

  return (
    <div>
      <PageBanner
        kicker="Checkout"
        title="Pay & Pickup"
        sub={
          orderingEnabled
            ? "Contact details, then Clover card pay. Only active Clover-linked in-stock items go through."
            : "Online pickup checkout is coming soon."
        }
        bg="var(--page-bg)"
        color="var(--ink)"
        surface="surface-yellow"
      />
      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap" style={{ maxWidth: 960 }}>
          <Reveal>
            {orderingEnabled ? <CheckoutClient /> : <OrderingUnavailableNotice title="Checkout coming soon" />}
          </Reveal>
          <div style={{ marginTop: 20 }}>
            {orderingEnabled ? (
              <Btn page="cart" variant="cream">
                ← Cart
              </Btn>
            ) : (
              <Btn page="eats" variant="cream">
                ← Menu
              </Btn>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
