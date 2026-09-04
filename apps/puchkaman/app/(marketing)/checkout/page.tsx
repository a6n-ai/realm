import type { Metadata } from "next";
import { Btn, PageBanner } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";
import { CheckoutClient } from "@/components/order/checkout-client";
import { OrderingUnavailableNotice } from "@/components/order/ordering-unavailable";
import { isPublicOrderingEnabled } from "@/lib/clover/public-ordering";
import { getAllDeliveryTypes, getStoreLocation } from "@/lib/delivery/zones.service";
import { PICKUP_TYPE_KEY } from "@/lib/delivery/type-pricing";
import { inventoryCatalogService } from "@/lib/services/inventory.service";
import { ordersService } from "@/lib/services/orders.service";
import { buildMetadata } from "@/lib/seo";
import type { PublicOffer } from "@/components/order/discount-picker";
import type { UpsellItem } from "@/components/order/checkout-client";

// Never indexable — transactional, per-session, and shouldn't be crawlable.
export const metadata: Metadata = buildMetadata({
  title: "Checkout | Puchkaman",
  description: "Complete your Puchkaman pickup order.",
  path: "/checkout",
  noIndex: true,
});

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ fulfillment?: string }>;
}) {
  const [orderingEnabled, params, offerRows, catalog, deliveryTypes, wallet, storeLocation] = await Promise.all([
    isPublicOrderingEnabled(),
    searchParams,
    inventoryCatalogService.discounts.listPublicOffers(),
    ordersService.listOrderableCatalog(),
    getAllDeliveryTypes(),
    ordersService.getCheckoutWalletBalance(),
    getStoreLocation(),
  ]);
  // Pickup's own discount, so the fulfillment choice can name it before the
  // quote lands rather than leaving the saving to appear out of nowhere.
  const pickupDiscountPct =
    deliveryTypes.find((t) => t.key === PICKUP_TYPE_KEY && t.active)?.discountPct ?? 0;
  // Cheapest one-tap add-ons (no modifier picker needed) — surfaced when a
  // delivery minimum is just out of reach, so the shortfall message doubles
  // as an upsell instead of a dead end.
  const upsellItems: UpsellItem[] = catalog
    .filter((p) => p.modifierGroups.length === 0)
    .sort((a, b) => a.price - b.price)
    .slice(0, 3)
    .map((p) => ({ publicId: p.publicId, name: p.name, price: p.price, category: p.category }));
  // Clover discounts the merchant published as self-servable. The label is
  // rendered here so the client never has to know Clover's amount encoding.
  const offers: PublicOffer[] = offerRows.map((r) => ({
    publicId: r.publicId,
    name: r.name,
    label:
      r.percentage != null && r.percentage !== ""
        ? `${Number(r.percentage)}% off`
        : `$${Math.abs(Number(r.amount ?? 0)).toFixed(2)} off`,
  }));
  // Order Direct / Schedule Delivery link here with ?fulfillment=delivery so customers
  // don't re-select what they just told us. Resolved on the server, so the client never
  // has to read window.location after mount.
  const initialFulfillment = params.fulfillment === "delivery" ? "delivery" : "pickup";

  return (
    <div>
      <PageBanner
        kicker="Checkout"
        title="Pay & Pickup"
        sub={
          orderingEnabled
            ? "Two steps: your details, then a secure card form. Nothing is charged until step two."
            : "Online pickup checkout is coming soon."
        }
        bg="var(--page-bg)"
        color="var(--ink)"
        surface="surface-yellow"
      />
      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap" style={{ maxWidth: 1040 }}>
          <Reveal>
            {orderingEnabled ? (
              <CheckoutClient
                initialFulfillment={initialFulfillment}
                offers={offers}
                upsellItems={upsellItems}
                pickupDiscountPct={pickupDiscountPct}
                canRedeemCoins={wallet.canRedeem}
                coinBalance={wallet.balance}
                storeLocation={storeLocation}
              />
            ) : (
              <OrderingUnavailableNotice title="Checkout coming soon" />
            )}
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
