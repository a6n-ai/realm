import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, businessJsonLd, jsonLdScript, menuJsonLd } from "./business-jsonld";

const zone = (name: string, active = true) => ({ publicId: name, name, radiusKm: null, postalPrefixes: [], slotWindow: null, active }) as never;

describe("businessJsonLd", () => {
  it("serves only active zones, on the given origin", () => {
    const g = businessJsonLd({ zones: [zone("Vaughan"), zone("Brampton"), zone("Closed", false)], plans: [], mealSizes: [] } as never, "https://tiffingrab.ca", { currency: "CAD" });
    const biz = g["@graph"][0] as { url: string; areaServed: { name: string }[] };
    expect(biz.url).toBe("https://tiffingrab.ca/");
    expect(biz.areaServed.map((a) => a.name)).toEqual(["Greater Toronto Area", "Brampton", "Vaughan"]);
  });
});

describe("rating, breadcrumbs, menu", () => {
  const cat = { zones: [zone("Durham Region")], plans: [], mealSizes: [] } as never;
  it("adds the rating only when reviews are connected", () => {
    const biz = (r: never) => businessJsonLd(cat, "https://x.ca", { currency: "CAD", rating: r })["@graph"][0] as Record<string, unknown>;
    expect(biz(null as never).aggregateRating).toBeUndefined();
    const b = biz({ rating: 4.8, total: 20, url: "https://maps.google.com/?cid=1" } as never);
    expect(b.aggregateRating).toMatchObject({ ratingValue: 4.8, reviewCount: 20 });
    expect(b.sameAs).toEqual(["https://maps.google.com/?cid=1"]);
    expect((b.areaServed as { "@type": string }[])[1]!["@type"]).toBe("AdministrativeArea");
  });
  it("builds breadcrumbs and omits an empty menu", () => {
    expect(breadcrumbJsonLd("https://x.ca", "Menu", "/menu").itemListElement[1]!.item).toBe("https://x.ca/menu");
    expect(menuJsonLd([], "https://x.ca")).toBeNull();
    expect(menuJsonLd([{ label: "Mon", dishes: { Sabzi: ["Aloo"] } }], "https://x.ca")?.hasMenuSection[0]!.hasMenuItem).toEqual([{ "@type": "MenuItem", name: "Aloo" }]);
  });
});

describe("jsonLdScript", () => {
  it("cannot close the script tag", () => {
    expect(jsonLdScript({ a: "</script><b>" })).not.toContain("</script");
  });
});
