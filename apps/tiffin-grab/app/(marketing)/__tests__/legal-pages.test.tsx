import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog/load", () => ({
  loadCatalogSnapshot: async () => ({
    zones: [
      { name: "Scarborough", active: true },
      { name: "Brampton", active: true },
      { name: "Closed Zone", active: false },
    ],
  }),
}));
import { renderToStaticMarkup } from "react-dom/server";
import LegalHub from "../legal/page";
import Terms from "../terms/page";
import Privacy from "../privacy/page";
import Refund from "../refund-policy/page";
import Delivery from "../delivery-policy/page";

describe("legal pages", () => {
  it("hub links every policy", () => {
    const html = renderToStaticMarkup(<LegalHub />);
    for (const href of ["/terms", "/privacy", "/refund-policy", "/delivery-policy"]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain("Quick answers");
  });

  it.each([
    ["terms", Terms, "Terms &amp; conditions", 11, "shared kitchen"],
    ["privacy", Privacy, "Privacy policy", 9, "Privacy Commissioner of Canada"],
    ["refund", Refund, "Refund &amp; return policy", 9, "48 hours before"],
    ["delivery", Delivery, "Delivery policy", 8, "+1 (647) 244-9813"],
  ])("%s renders its title, every numbered section and key wording", async (_n, Page, title, sections, phrase) => {
    const html = renderToStaticMarkup(await (Page as () => Promise<React.ReactElement> | React.ReactElement)());
    expect(html).toContain(title);
    expect(html).toContain("Updated April 6, 2026");
    expect(html).toContain("The short version");
    expect(html).not.toContain("§");
    expect((html.match(/id="s\d+"/g) ?? []).length).toBe(sections);
    expect(html).toContain(phrase);
    if (_n === "delivery") {
      expect(html).toContain("Monday through Friday");
      expect(html).not.toContain("Saturday");
      // areas are the live active zones, sorted, inactive ones left out
      expect(html.indexOf("Brampton")).toBeLessThan(html.indexOf("Scarborough"));
      expect(html).not.toContain("Closed Zone");
    }
    // every key point's "Details" link lands on a section that exists
    for (const [, n] of html.matchAll(/href="#s(\d+)"/g)) expect(html).toContain(`id="s${n}"`);
  });
});
