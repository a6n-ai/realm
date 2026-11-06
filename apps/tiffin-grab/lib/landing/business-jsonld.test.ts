import { describe, expect, it } from "vitest";
import { businessJsonLd, jsonLdScript } from "./business-jsonld";

const zone = (name: string, active = true) => ({ publicId: name, name, radiusKm: null, postalPrefixes: [], slotWindow: null, active }) as never;

describe("businessJsonLd", () => {
  it("serves only active zones, on the given origin", () => {
    const g = businessJsonLd({ zones: [zone("Vaughan"), zone("Brampton"), zone("Closed", false)] }, "https://tiffingrab.ca");
    const biz = g["@graph"][0] as { url: string; areaServed: { name: string }[] };
    expect(biz.url).toBe("https://tiffingrab.ca/");
    expect(biz.areaServed.map((a) => a.name)).toEqual(["Greater Toronto Area", "Brampton", "Vaughan"]);
  });
});

describe("jsonLdScript", () => {
  it("cannot close the script tag", () => {
    expect(jsonLdScript({ a: "</script><b>" })).not.toContain("</script");
  });
});
