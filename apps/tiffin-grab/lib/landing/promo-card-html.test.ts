import { describe, expect, it } from "vitest";
import { promoCardHtml } from "./promo-card-html";

describe("promoCardHtml", () => {
  it("leads with the badge, then title and blurb, escaped", () => {
    const html = promoCardHtml({ badge: "$65 off", title: "Tom & Jerry <3", blurb: "Use WELCOME10" });
    expect(html).toContain(">$65 off</strong>");
    expect(html).toContain(">Tom &amp; Jerry &lt;3</span>");
    expect(html).toContain(">Use WELCOME10</p>");
  });

  it("uses the title as the headline when there is no badge", () => {
    const html = promoCardHtml({ badge: null, title: "Free delivery", blurb: null });
    expect(html).toContain(">Free delivery</strong>");
    expect(html).not.toContain("<span");
    expect(html).not.toContain("<p");
  });
});
