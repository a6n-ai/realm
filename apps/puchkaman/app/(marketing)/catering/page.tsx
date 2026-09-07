import type { Metadata } from "next";
import { CateringView } from "./catering-view";
import { SITE_URL, buildMetadata, breadcrumbJsonLd } from "@/lib/seo";
import { LOCATIONS } from "@/lib/links";

export const metadata: Metadata = buildMetadata({
  title: "Puchka & Chaat Catering — Toronto & Vancouver | Puchkaman",
  description:
    "Live puchka & chaat catering across Toronto & the GTA and Metro Vancouver & the Lower Mainland. Birthdays, weddings, offices, watch parties — live stations, 20 to 500 guests. Get a quote in 24 hours.",
  path: "/catering",
});

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  serviceType: "Live Street Food Catering",
  // Two providers, matching the two Restaurant nodes emitted in the root layout
  // (lib/seo.ts localBusinessJsonLd) — same @id values, so search engines tie
  // this service to both storefronts rather than an invented third entity.
  // The old "#business" @id referenced a node that no longer exists.
  provider: LOCATIONS.map((loc) => ({
    "@type": "Restaurant",
    "@id": `${SITE_URL}/#business-${loc.city.toLowerCase()}`,
    name: `Puchkaman — ${loc.city}, ${loc.province}`,
  })),
  areaServed: [
    { "@type": "AdministrativeArea", name: "Greater Toronto Area" },
    { "@type": "AdministrativeArea", name: "Metro Vancouver" },
  ],
  description:
    "Live puchka, chaat and street-food catering stations for birthdays, weddings, offices, private and community events across Toronto & the GTA and Metro Vancouver & the Lower Mainland.",
};

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Catering", path: "/catering" },
]);

export default function CateringPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <CateringView />
    </>
  );
}
