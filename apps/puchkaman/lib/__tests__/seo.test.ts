import { describe, expect, it } from "vitest";
import { jsonLdHtml } from "../seo";

describe("jsonLdHtml", () => {
  // Product names and descriptions are merchant-authored in Clover, so a closing
  // script tag in one of them must not be able to escape the <script> block.
  it("escapes a closing script tag", () => {
    const out = jsonLdHtml({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script");
  });

  it("escapes every angle bracket", () => {
    expect(jsonLdHtml({ name: "<img onerror=x>" })).not.toContain("<");
  });

  it("still parses back to the original value", () => {
    const value = { name: "</script>", nested: { list: ["<b>", 1, true, null] } };
    expect(JSON.parse(jsonLdHtml(value))).toEqual(value);
  });

  it("leaves ordinary content alone", () => {
    expect(jsonLdHtml({ name: "Aloo Tikki Burger" })).toBe('{"name":"Aloo Tikki Burger"}');
  });
});
