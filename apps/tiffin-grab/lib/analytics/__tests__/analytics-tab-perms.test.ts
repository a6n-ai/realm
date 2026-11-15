import { describe, expect, it } from "vitest";
import { TAB_PERMS, firstAllowedTab } from "../../../app/(dashboard)/dashboard/analytics/tab-perms";

const tabs: [string, Record<string, string[]>][] = [
  ["/a", { finance: ["read"] }],
  ["/b", { inquiry: ["read"] }],
  ["/c", { ticket: ["read"] }],
];

const allow = (granted: string) => async (perms: Record<string, string[]>) => Object.keys(perms)[0] === granted;

describe("firstAllowedTab", () => {
  it("lands on the first tab the viewer can open, not the overview", async () => {
    expect(await firstAllowedTab(tabs, allow("inquiry"))).toBe("/b");
  });

  it("falls back to the first tab when none is allowed", async () => {
    expect(await firstAllowedTab(tabs, async () => false)).toBe("/a");
  });

  it("lists every analytics tab once", () => {
    expect(new Set(TAB_PERMS.map(([href]) => href)).size).toBe(TAB_PERMS.length);
  });
});
