import type { Metadata } from "next";
import { ContactView } from "./contact-view";
import { buildMetadata, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Contact Puchkaman — 3315 Danforth Ave, Scarborough | Hours & Directions",
  description:
    "Visit Puchkaman at 3315 Danforth Ave, Scarborough, ON. Open Sun–Thu 3pm–2am, Fri–Sat 3pm–3am. Call, WhatsApp, get directions, or book catering.",
  path: "/contact",
});

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Contact", path: "/contact" },
]);

export default function ContactPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <ContactView />
    </>
  );
}
