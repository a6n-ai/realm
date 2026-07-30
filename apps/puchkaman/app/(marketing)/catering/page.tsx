import type { Metadata } from "next";
import { CateringView } from "./catering-view";
import { SITE_URL, buildMetadata, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Puchka & Chaat Catering in Toronto & the GTA | Puchkaman",
  description:
    "Live puchka & chaat catering across Scarborough, Toronto & the GTA. Birthdays, weddings, offices, watch parties — live stations, 20 to 500 guests. Get a quote in 24 hours.",
  path: "/catering",
});

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  serviceType: "Live Street Food Catering",
  provider: { "@type": "Restaurant", "@id": `${SITE_URL}/#business`, name: "Puchkaman" },
  areaServed: { "@type": "AdministrativeArea", name: "Greater Toronto Area" },
  description:
    "Live puchka, chaat and street-food catering stations for birthdays, weddings, offices, private and community events across the GTA.",
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
