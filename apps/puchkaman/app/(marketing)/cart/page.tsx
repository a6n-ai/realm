import { Btn, PageBanner } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";
import { CartPageClient } from "@/components/cart/cart-page-client";

export default function CartPage() {
  return (
    <div>
      <PageBanner
        kicker="Your bag"
        title="Pickup Cart"
        sub="Tweak quantities, then checkout. Totals are confirmed server-side — never trust the browser alone."
        bg="var(--page-bg)"
        color="var(--ink)"
        surface="surface-yellow"
      />
      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap" style={{ maxWidth: 720 }}>
          <Reveal>
            <CartPageClient />
          </Reveal>
          <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Btn page="eats" variant="cream">
              ← Menu
            </Btn>
            <Btn page="order" variant="ink">
              Order hub
            </Btn>
          </div>
        </div>
      </section>
    </div>
  );
}
