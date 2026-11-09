import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiCatalog, docsMarkdown, openApi } from "@/lib/public-api/openapi";
import { deliveryCheck, normalizePostal } from "@/lib/public-api/postal";

const zones = [
  { name: "Toronto", active: true, postalPrefixes: ["M4", "M5"], slotWindow: "11:00 AM – 2:00 PM" },
  { name: "East York", active: true, postalPrefixes: ["M4B"], slotWindow: "3:00 PM – 6:00 PM" },
  { name: "Old", active: false, postalPrefixes: ["L9"], slotWindow: null },
];

describe("normalizePostal", () => {
  it.each([["m5v 2t6", "M5V2T6"], [" M5V ", "M5V"], ["M5V-2T6", "M5V2T6"]])("accepts %s", (i, o) => expect(normalizePostal(i)).toBe(o));
  it.each([[null], [""], ["M5"], ["D5V2T6"], ["M5V2T"], ["90210"], ["M5V2T6X"], ["M5D"]])("rejects %s", (i) => expect(normalizePostal(i)).toBeNull());
});

describe("deliveryCheck", () => {
  it("longest prefix wins: M4B is East York, not Toronto's M4", () => {
    expect(deliveryCheck(zones, "M4B1A1")).toMatchObject({ served: true, area: "East York", window: { from: "3 PM", to: "6 PM" } });
    expect(deliveryCheck(zones, "M4C")).toMatchObject({ area: "Toronto" });
  });
  it("ignores inactive zones and unknown codes", () => {
    expect(deliveryCheck(zones, "L9T")).toEqual({ postal: "L9T", served: false, area: null, window: null });
  });
});

describe("api description", () => {
  beforeEach(() => vi.stubEnv("BETTER_AUTH_URL", "https://app.tiffingrab.ca"));
  afterEach(() => vi.unstubAllEnvs());

  it("api-catalog is an RFC 9727 linkset", () => {
    expect(apiCatalog("https://tiffingrab.ca")).toEqual({
      linkset: [{
        anchor: "https://tiffingrab.ca/api/public/v1",
        "service-desc": [{ href: "https://tiffingrab.ca/api/public/v1/openapi.json", type: "application/openapi+json" }],
        "service-doc": [{ href: "https://tiffingrab.ca/api/public/v1/docs", type: "text/markdown" }],
        status: [{ href: "https://tiffingrab.ca/api/public/v1/health", type: "application/json" }],
      }],
    });
  });

  it("OpenAPI paths cover every endpoint and the docs list them", () => {
    const spec = openApi("https://tiffingrab.ca");
    expect(Object.keys(spec.paths).sort()).toEqual(["/contact", "/delivery", "/delivery/check", "/docs", "/faq", "/health", "/menu", "/openapi.json", "/plans", "/promotions", "/referral"]);
    expect(spec.servers).toEqual([{ url: "https://tiffingrab.ca/api/public/v1" }]);
    const md = docsMarkdown("https://tiffingrab.ca");
    for (const p of Object.keys(spec.paths)) expect(md).toContain(`### GET ${p}`);
  });
});
