import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isValidAnalyticsCardCount } from "../card-rules";

const DASH = join(__dirname, "../../../app/(dashboard)/dashboard");
const TABS = readdirSync(join(DASH, "analytics"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => join(DASH, "analytics", d.name, "page.tsx"));
const PAGES = [...TABS, join(DASH, "notifications/analytics/page.tsx")];

describe("analytics stat card rules", () => {
  it("accepts only full rows of 4 or 8", () => {
    expect([3, 4, 5, 7, 8, 12].filter(isValidAnalyticsCardCount)).toEqual([4, 8]);
  });

  it.each(PAGES)("%s uses AnalyticsStatCards and a 4 or 8 card skeleton", (file) => {
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      return; // a tab folder without its own page (redirect-only)
    }
    if (!src.includes("StatCards")) return;
    expect(src).toContain("<AnalyticsStatCards");
    expect(src).not.toMatch(/<StatCards\b/);
    for (const m of src.matchAll(/StatCardsSkeleton count=\{(\d+)\}/g)) {
      expect(isValidAnalyticsCardCount(Number(m[1]))).toBe(true);
    }
  });
});
