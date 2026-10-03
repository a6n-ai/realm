import { describe, expect, it } from "vitest";
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
  });

  it.each([
    ["terms", Terms, "Terms &amp; conditions", 11, "shared kitchen"],
    ["privacy", Privacy, "Privacy policy", 9, "Privacy Commissioner of Canada"],
    ["refund", Refund, "Refund &amp; return policy", 9, "48 hours before"],
    ["delivery", Delivery, "Delivery policy", 8, "+1 (647) 244-9813"],
  ])("%s renders its title, every numbered section and key wording", (_n, Page, title, sections, phrase) => {
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain(title);
    expect(html).toContain("Effective: April 6, 2026");
    expect((html.match(/id="s\d+"/g) ?? []).length).toBe(sections);
    expect(html).toContain(phrase);
  });
});
