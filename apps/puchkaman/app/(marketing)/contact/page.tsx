import type { Metadata } from "next";
import { ContactView } from "./contact-view";
import { buildMetadata, breadcrumbJsonLd } from "@/lib/seo";
import { getActiveLocation } from "@/lib/services/organizations.service";

export const metadata: Metadata = buildMetadata({
  title: "Contact Puchkaman — Scarborough, ON & Delta, BC (Metro Vancouver) | Hours & Directions",
  description:
    "Visit Puchkaman at 3315 Danforth Ave, Scarborough, ON (open Sun–Thu 3pm–2am, Fri–Sat 3pm–3am) or 9253 120 St, Delta, BC (Metro Vancouver). Call, WhatsApp, get directions, or book catering.",
  path: "/contact",
});

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Contact", path: "/contact" },
]);

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const location = await getActiveLocation();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <ContactView activeCity={location?.city ?? null} />
    </>
  );
}
