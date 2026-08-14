import { describe, expect, it } from "vitest";
import { Role } from "@realm/commons";
import { grantedKeys } from "@/lib/auth/nav-permissions";
import { getNavSections } from "../app-sidebar";

const hrefs = (granted: string[]) =>
  getNavSections({ statuses: {}, granted }).flatMap((s) => s.items.map((i) => i.href));

describe("nav filtering", () => {
  it("gives an admin the full nav", () => {
    const all = hrefs(grantedKeys(Role.ADMIN));
    expect(all).toContain("/dashboard/settings");
    expect(all).toContain("/dashboard/orders");
    expect(all).toContain("/dashboard/logs");
  });

  it("hides admin-only destinations from a member", () => {
    const mine = hrefs(grantedKeys(Role.MEMBER));
    expect(mine).toContain("/dashboard/orders");
    expect(mine).toContain("/dashboard/products");
    expect(mine).toContain("/dashboard/finance");
    expect(mine).toContain("/dashboard/account");
    expect(mine).not.toContain("/dashboard/settings");
    expect(mine).not.toContain("/dashboard/logs");
    expect(mine).not.toContain("/dashboard/notifications");
    expect(mine).not.toContain("/dashboard/settings/integrations");
  });

  it("omitting granted keeps every item, so existing callers are unchanged", () => {
    const all = getNavSections({ statuses: {} }).flatMap((s) => s.items);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((i) => i.href === "/dashboard/settings")).toBe(true);
  });

  it("drops a section that has no visible items rather than leaving an empty heading", () => {
    const sections = getNavSections({ statuses: {}, granted: grantedKeys(Role.MEMBER) });
    for (const s of sections) expect(s.items.length).toBeGreaterThan(0);
  });
});
