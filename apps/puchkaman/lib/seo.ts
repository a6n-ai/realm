import type { Metadata } from "next";
import { ADDRESS, PHONE_TEL } from "@/lib/links";
import { STORE_LAT, STORE_LNG } from "@/lib/delivery/distance";

export const SITE_NAME = "Puchkaman";
export const SITE_URL = "https://puchkaman.ca";
export const INSTAGRAM_URL = "https://www.instagram.com/puchkamancanada";

// Reuses the storefront photo already on the site — no purpose-built 1200x630
// OG image exists yet, and a real photo beats a placeholder.
export const DEFAULT_OG_IMAGE = "/about/storefront.jpg";

// Matches the hours shown on /contact and the footer — keep in sync if either changes.
export const OPENING_HOURS = [
  { days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"], opens: "15:00", closes: "02:00" },
  { days: ["Friday", "Saturday"], opens: "15:00", closes: "03:00" },
];

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

/** Site-wide Organization + Restaurant (LocalBusiness) structured data — injected once in the root layout. */
export function localBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${SITE_URL}/#business`,
    name: SITE_NAME,
    url: SITE_URL,
    image: `${SITE_URL}${DEFAULT_OG_IMAGE}`,
    logo: `${SITE_URL}/logo.webp`,
    telephone: PHONE_TEL,
    servesCuisine: ["Indian Street Food", "Fusion", "Chaat"],
    priceRange: "$$",
    address: {
      "@type": "PostalAddress",
      streetAddress: "3315 Danforth Ave",
      addressLocality: "Scarborough",
      addressRegion: "ON",
      addressCountry: "CA",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: STORE_LAT,
      longitude: STORE_LNG,
    },
    openingHoursSpecification: OPENING_HOURS.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.days,
      opens: h.opens,
      closes: h.closes,
    })),
    sameAs: [INSTAGRAM_URL],
  };
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
