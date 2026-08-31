import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Role } from "@foundry/commons";
import { CLOVER_PLUGIN_ID } from "@foundry/clover/plugin";
import { grantedKeys } from "@/lib/auth/nav-permissions";
import { getNavSections, getUserMenuItems } from "../app-sidebar";

const hrefs = (granted: string[], statuses: Parameters<typeof getNavSections>[0]["statuses"] = {}) =>
  getNavSections({ statuses, granted }).flatMap((s) => s.items.map((i) => i.href));

describe("nav filtering", () => {
  it("gives an admin the full nav", () => {
    const all = hrefs(grantedKeys(Role.ADMIN));
    expect(all).toContain("/dashboard/settings");
    expect(all).toContain("/dashboard/orders");
    expect(all).toContain("/dashboard/logs");
    expect(all).toContain("/dashboard/organization/clients");
    // Reachable only via Settings' own cards now, not as top-level sidebar
    // entries — Account still exists, via the footer menu (see below), not
    // getNavSections.
    expect(all).not.toContain("/dashboard/settings/delivery/options");
    expect(all).not.toContain("/dashboard/settings/integrations");
    expect(all).not.toContain("/dashboard/account");
  });

  it("gives a member the surfaces the permission audit granted, still hides the rest", () => {
    const mine = hrefs(grantedKeys(Role.MEMBER));
    expect(mine).toContain("/dashboard/orders");
    expect(mine).toContain("/dashboard/products");
    expect(mine).toContain("/dashboard/finance");
    // audit:read is genuinely gated by requirePermission on its destination —
    // member reaches this one.
    expect(mine).toContain("/dashboard/logs");
    // settings:read only widened for the google-reviews sub-page; the Settings
    // hub and Notifications pages themselves still call requireAdmin(), so
    // their nav links must stay hidden or a member would see a link that
    // ForbiddenError()s on click.
    expect(mine).not.toContain("/dashboard/settings");
    expect(mine).not.toContain("/dashboard/notifications");
    // organization:read was never granted to member — this stays admin-only.
    expect(mine).not.toContain("/dashboard/organization/clients");
  });

  it("never surfaces Clover's Connection link — reachable only via the Settings card, for any role", () => {
    // "Connection" (merchant OAuth) is dropped from the sidebar entirely, not
    // role-gated — it was a straight duplicate of the Settings page's own
    // Clover card, and its page stays behind requireAdmin() regardless.
    const admin = hrefs(grantedKeys(Role.ADMIN), { [CLOVER_PLUGIN_ID]: { installed: true } });
    const member = hrefs(grantedKeys(Role.MEMBER), { [CLOVER_PLUGIN_ID]: { installed: true } });
    expect(admin).not.toContain("/dashboard/settings/clover");
    expect(member).not.toContain("/dashboard/settings/clover");
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
