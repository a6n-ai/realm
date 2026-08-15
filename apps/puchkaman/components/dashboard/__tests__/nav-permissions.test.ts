import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Role } from "@realm/commons";
import { grantedKeys } from "@/lib/auth/nav-permissions";
import { getNavSections, getUserMenuItems } from "../app-sidebar";

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

describe("footer user menu", () => {
  it("hides Settings from a member, whose click would hit requireAdmin and 500", () => {
    const mine = getUserMenuItems(grantedKeys(Role.MEMBER)).map((i) => i.href);
    expect(mine).toContain("/dashboard/account");
    expect(mine).not.toContain("/dashboard/settings");
  });

  it("keeps Settings for an admin", () => {
    expect(getUserMenuItems(grantedKeys(Role.ADMIN)).map((i) => i.href)).toContain(
      "/dashboard/settings",
    );
  });

  /**
   * The Settings link shipped ungated because it was rendered directly in the
   * footer, outside the lists these tests filter — so every assertion above
   * passed while the link was still there. Nothing in a props-level test can
   * see a hardcoded <Link>, so this reads the source instead: every dashboard
   * destination must come from a permission-filtered list, leaving only the
   * brand link (which goes to /dashboard, reachable by anyone in the console).
   */
  it("renders no dashboard destination outside a permission-filtered list", () => {
    const src = readFileSync(join(__dirname, "..", "app-sidebar.tsx"), "utf8");
    const inline = [...src.matchAll(/href="(\/dashboard[^"]*)"/g)].map((m) => m[1]);
    expect(inline).toEqual(["/dashboard"]);
  });
});
