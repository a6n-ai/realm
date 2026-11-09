import type { CatalogSnapshot } from "@/lib/catalog/types";
import { isComingSoon, publicPlans } from "@/lib/landing/plan-options";
import { listableMealSizes } from "@/lib/catalog/types";
import { SUPPORT_E164 } from "@/lib/landing/contact";
import { shortMoney } from "@/lib/landing/live-figures";
import { effectivePrice } from "@/lib/pricing";

type Rating = { rating: number; total: number; url?: string } | null;
type Opts = { currency: string; rating?: Rating };

const REGION = /\b(region|durham|peel|halton)\b/i;
const priceOf = (m: CatalogSnapshot["mealSizes"][number]) => effectivePrice(m.basePrice, m);
const orderableSizes = (catalog: CatalogSnapshot) => {
  const keys = publicPlans(catalog.plans).filter((p) => !isComingSoon(p.key)).map((p) => p.key);
  return listableMealSizes(catalog.mealSizes).filter((m) => !m.trial && keys.includes(m.planKey));
};

/** schema.org graph for the home page: the business and the site. No address (delivery only),
 *  so this is an entity signal, not a map-pack listing. Rating is Google's own, only when connected. */
export function businessJsonLd(catalog: CatalogSnapshot, origin: string, { currency, rating }: Opts) {
  const areas = catalog.zones.filter((z) => z.active).map((z) => z.name).sort();
  const rates = orderableSizes(catalog).map(priceOf);
  const priceRange = rates.length ? `${shortMoney(Math.min(...rates), currency)}-${shortMoney(Math.max(...rates), currency)}` : undefined;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FoodEstablishment",
        "@id": `${origin}/#business`,
        name: "Tiffin Grab",
        url: `${origin}/`,
        logo: `${origin}/brand/mark.svg`,
        image: `${origin}/opengraph-image.png`,
        description: "Home-style Indian tiffin meals, cooked in small batches and delivered on a subscription you build yourself.",
        servesCuisine: "Indian",
        telephone: `+${SUPPORT_E164}`,
        priceRange,
        hasMenu: `${origin}/menu`,
        ...(rating && rating.total > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: rating.rating, reviewCount: rating.total, bestRating: 5 } } : {}),
        ...(rating?.url ? { sameAs: [rating.url] } : {}),
        areaServed: [{ "@type": "AdministrativeArea", name: "Greater Toronto Area" }, ...areas.map((name) => ({ "@type": REGION.test(name) ? "AdministrativeArea" : "City", name }))],
      },
      { "@type": "WebSite", "@id": `${origin}/#website`, name: "Tiffin Grab", url: `${origin}/`, publisher: { "@id": `${origin}/#business` } },
    ],
  };
}

/** Home > page trail. */
export const breadcrumbJsonLd = (origin: string, name: string, path: string) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
    { "@type": "ListItem", position: 2, name, item: `${origin}${path}` },
  ],
});

/** One Offer per orderable meal size, at its live per-tiffin rate. */
export function pricingJsonLd(catalog: CatalogSnapshot, origin: string, currency: string) {
  const offers = orderableSizes(catalog).map((m) => ({
    "@type": "Offer",
    name: m.name,
    price: priceOf(m).toFixed(2),
    priceCurrency: currency,
    url: `${origin}/pricing`,
    seller: { "@id": `${origin}/#business` },
  }));
  return offers.length ? { "@context": "https://schema.org", "@type": "OfferCatalog", name: "Tiffin Grab plans", itemListElement: offers } : null;
}

/** Menu with a section per published day; null when no week is published. */
export function menuJsonLd(days: { label: string; dishes: Record<string, string[]> }[], origin: string) {
  const hasMenuSection = days
    .map((d) => ({ "@type": "MenuSection", name: d.label, hasMenuItem: [...new Set(Object.values(d.dishes).flat())].map((name) => ({ "@type": "MenuItem", name })) }))
    .filter((s) => s.hasMenuItem.length > 0);
  return hasMenuSection.length ? { "@context": "https://schema.org", "@type": "Menu", "@id": `${origin}/menu`, name: "This week's tiffin menu", url: `${origin}/menu`, hasMenuSection } : null;
}

/** JSON for a <script type="application/ld+json">, with "<" escaped so zone names can't close the tag. */
export const jsonLdScript = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
