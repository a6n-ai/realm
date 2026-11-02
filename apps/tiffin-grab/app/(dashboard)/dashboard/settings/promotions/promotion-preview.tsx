"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { OfferCarousel } from "@/components/landing/promo/offer-carousel";
import { PromoPanel } from "@/components/landing/promo-popup";
import type { LandingPromo } from "@/lib/landing/promo-types";
import thali from "@/public/landing/stock/thali-hero.jpg";

/** The real landing components with the form's current values. .tg-promo-scope pins the public
 *  site's light tokens and Poppins here, whatever theme the dashboard is in. */
export function PromotionPreview({ promo }: { promo: LandingPromo }) {
  return (
    // Links in the preview would leave the unsaved form, so they stay inert here.
    <Tabs defaultValue="section" className="gap-4" onClickCapture={(e) => { if ((e.target as HTMLElement).closest("a")) e.preventDefault(); }}>
      <TabsList>
        <TabsTrigger value="section">Landing section</TabsTrigger>
        <TabsTrigger value="popup">Popup</TabsTrigger>
      </TabsList>
      <TabsContent value="section">
        <div className="tg-promo-scope lp-offers bg-background rounded-xl p-4 md:p-6">
          <OfferCarousel promos={[promo]} photo={thali} label="Preview" />
        </div>
      </TabsContent>
      <TabsContent value="popup">
        <div className="tg-promo-scope bg-muted rounded-xl p-4 md:p-6">
          <PromoPanel promo={promo} fallbackImage={thali.src} className="tg-popup--inline" />
        </div>
      </TabsContent>
    </Tabs>
  );
}
