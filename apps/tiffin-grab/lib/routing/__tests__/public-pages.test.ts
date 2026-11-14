import { describe, expect, it } from "vitest";
import pages from "../public-pages.json";
import { PUBLIC_PAGES } from "../public-pages";

// The Worker page cache (cloudflare/page-cache.js) edge-caches exactly these paths.
describe("public-pages.json", () => {
  it("caches /refer but never a personalised /refer/<code> page", () => {
    expect(pages).toContain("/refer");
    expect(pages.some((p: string) => p.startsWith("/refer/"))).toBe(false);
  });
  it("holds the same paths as the TS list", () => {
    expect([...pages].sort()).toEqual(PUBLIC_PAGES.map((p) => p.path).sort());
  });
});
