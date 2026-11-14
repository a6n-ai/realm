import { describe, expect, it } from "vitest";
import { faqMd } from "../agent-markdown";
import { MD_PAGES, wantsMarkdown } from "../markdown-negotiation";

describe("wantsMarkdown", () => {
  it("is true when an agent asks for markdown", () => {
    expect(wantsMarkdown("text/markdown")).toBe(true);
    expect(wantsMarkdown("text/markdown, text/html;q=0.9")).toBe(true);
    expect(wantsMarkdown("text/html, text/markdown;q=0.5")).toBe(true);
  });
  it("is false for browsers and for a zero weight", () => {
    expect(wantsMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(false);
    expect(wantsMarkdown("text/markdown;q=0")).toBe(false);
    expect(wantsMarkdown(null)).toBe(false);
  });
  it("covers the pages that have a markdown version", () => {
    expect([...MD_PAGES].sort()).toEqual(["/", "/faq", "/locations", "/pricing"]);
  });
});

describe("faqMd", () => {
  it("keeps every question and answer under its group", () => {
    const md = faqMd([{ heading: "Food", items: [{ q: "Is it vegetarian?", a: "Most plans are." }] }], "https://tiffingrab.ca");
    expect(md).toContain("## Food\n\n### Is it vegetarian?\n\nMost plans are.");
    expect(md).toContain("Source: https://tiffingrab.ca/faq");
  });
});
