import type { Metadata } from "next";
import { Btn, PageBanner } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";
import { CartPageClient } from "@/components/cart/cart-page-client";
import { isPublicOrderingEnabled } from "@/lib/clover/public-ordering";
import { buildMetadata } from "@/lib/seo";

// Never indexable — a per-session cart, not a page worth ranking.
export const metadata: Metadata = buildMetadata({
  title: "Your Cart | Puchkaman",
  description: "Review your Puchkaman pickup cart before checkout.",
  path: "/cart",
  noIndex: true,
});

export default async function CartPage() {
  const orderingEnabled = await isPublicOrderingEnabled();

  return (
    <div>
      <PageBanner
        kicker="Your bag"
        title="Pickup Cart"
        sub={
          orderingEnabled
            ? "Tweak quantities, then checkout. Totals are confirmed server-side — never trust the browser alone."
            : "Online pickup cart is coming soon — browse the menu for now."
        }
        bg="var(--page-bg)"
        color="var(--ink)"
        surface="surface-yellow"
      />
      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap" style={{ maxWidth: 1000 }}>
          <Reveal>
            <CartPageClient />
          </Reveal>
          <div style={{ marginTop: 22 }}>
            <Btn page="order" variant="cream">
              ← Order hub
            </Btn>
          </div>
        </div>
      </section>
    </div>
  );
}
