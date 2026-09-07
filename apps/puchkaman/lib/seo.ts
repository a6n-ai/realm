import type { Metadata } from "next";
import { ADDRESS, LOCATIONS } from "@/lib/links";

export const SITE_NAME = "Puchkaman";
export const SITE_URL = "https://puchkaman.ca";
/** Brand-level handle. Each storefront also runs its own account — see
 *  `instagramUrl` on the LOCATIONS entries, which is what per-location UI
 *  and each Restaurant node's `sameAs` should use. */
export const INSTAGRAM_URL = "https://www.instagram.com/puchkamancanada";

// Reuses the storefront photo already on the site — no purpose-built 1200x630
// OG image exists yet, and a real photo beats a placeholder.
export const DEFAULT_OG_IMAGE = "/about/storefront.jpg";

/** Per-page metadata builder — fills canonical/OG/Twitter consistently from a title+description. */
export function buildMetadata({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
  noIndex?: boolean;
}): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [{ url: image }],
      locale: "en_CA",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

/**
 * One Restaurant entry per LOCATIONS entry — injected once in the root layout
 * (one <script> per location, see app/layout.tsx). Search engines model a
 * multi-location business as multiple LocalBusiness/Restaurant nodes sharing
 * a brand name, not one node with two addresses.
 *
 * Every field is read off the LOCATIONS entry, so each storefront publishes
 * its own phone, hours and Instagram — the two stores share neither a
 * schedule nor a social account.
 */
export function localBusinessJsonLd() {
  return LOCATIONS.map((loc) => {
    return {
      "@context": "https://schema.org",
      "@type": "Restaurant",
      "@id": `${SITE_URL}/#business-${loc.city.toLowerCase()}`,
      name: `${SITE_NAME} — ${loc.city}, ${loc.province}`,
      url: SITE_URL,
      image: `${SITE_URL}${DEFAULT_OG_IMAGE}`,
      logo: `${SITE_URL}/logo.webp`,
      telephone: loc.phoneTel,
      servesCuisine: ["Indian Street Food", "Fusion", "Chaat"],
      priceRange: "$$",
      address: {
        "@type": "PostalAddress",
        streetAddress: loc.addressLines[0],
        addressLocality: loc.city,
        addressRegion: loc.province,
        addressCountry: "CA",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: loc.lat,
        longitude: loc.lng,
      },
      openingHoursSpecification: loc.hours.map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: h.days,
        opens: h.opens,
        closes: h.closes,
      })),
      sameAs: [loc.instagramUrl],
    };
  });
}

/** Home → current page breadcrumb, matching the small visible breadcrumb rendered on inner pages. */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

/**
 * Serialise JSON-LD for injection into a `<script>` tag.
 *
 * `JSON.stringify` does not escape `<`, so a value containing `</script>` would close
 * the tag early and let the rest execute as markup. Product names and descriptions come
 * from the Clover catalog, which is merchant-authored data we do not control, so use
 * this rather than stringify-ing straight into `dangerouslySetInnerHTML`.
 * `<` is valid inside a JSON string and parses back to `<`.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Address string reused where full NAP text is needed inline (e.g. schema descriptions). */
export const ADDRESS_LINE = ADDRESS;
