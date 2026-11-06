import type { CatalogSnapshot } from "@/lib/catalog/types";
import { SUPPORT_E164 } from "@/lib/landing/contact";

/** schema.org graph for the home page: the business and the site. No address (delivery only),
 *  so this is an entity signal, not a map-pack listing. No AggregateRating: Google ignores
 *  self-served review stars for a business, and these reviews come from Google itself. */
export function businessJsonLd(catalog: Pick<CatalogSnapshot, "zones">, origin: string) {
  const areas = catalog.zones.filter((z) => z.active).map((z) => z.name).sort();
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
        areaServed: [{ "@type": "AdministrativeArea", name: "Greater Toronto Area" }, ...areas.map((name) => ({ "@type": "Place", name }))],
      },
      { "@type": "WebSite", "@id": `${origin}/#website`, name: "Tiffin Grab", url: `${origin}/`, publisher: { "@id": `${origin}/#business` } },
    ],
  };
}

/** JSON for a <script type="application/ld+json">, with "<" escaped so zone names can't close the tag. */
export const jsonLdScript = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
