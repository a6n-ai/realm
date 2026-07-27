import { Btn, PageBanner } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";
import { CheckoutClient } from "@/components/order/checkout-client";

export default function CheckoutPage() {
  return (
    <div>
      <PageBanner
        kicker="Checkout"
        title="Pay & Pickup"
        sub="Contact details, then Clover card pay. Only active Clover-linked in-stock items go through."
        bg="var(--page-bg)"
        color="var(--ink)"
        surface="surface-yellow"
      />
      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap" style={{ maxWidth: 960 }}>
          <Reveal>
            <CheckoutClient />
          </Reveal>
          <div style={{ marginTop: 20 }}>
            <Btn page="cart" variant="cream">
              ← Cart
            </Btn>
          </div>
        </div>
      </section>
    </div>
  );
}
