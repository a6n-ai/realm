import { describe, expect, it } from "vitest";
import pages from "../public-pages.json";

// The zone cache rule (scripts/cloudflare-cache.mjs) edge-caches exactly these paths.
describe("public-pages.json", () => {
  it("caches /refer but never a personalised /refer/<code> page", () => {
    expect(pages).toContain("/refer");
    expect(pages.some((p: string) => p.startsWith("/refer/"))).toBe(false);
  });
});
