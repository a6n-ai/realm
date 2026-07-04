import { describe, expect, it } from "vitest";
import { deriveBreadcrumbs } from "../breadcrumbs";

describe("deriveBreadcrumbs", () => {
  it("maps known dashboard segments", () => {
    expect(deriveBreadcrumbs("/dashboard/inquiries")).toEqual([
      { label: "Dashboard", href: "/dashboard" },
      { label: "Inquiries" },
    ]);
  });
  it("title-cases unknown segments", () => {
    const crumbs = deriveBreadcrumbs("/dashboard/widgets-list");
    expect(crumbs.at(-1)).toEqual({ label: "Widgets List" });
  });
  it("hides the Settings crumb for sections promoted to top-level nav", () => {
    expect(deriveBreadcrumbs("/dashboard/wallet/ledger").map((c) => c.label)).toEqual([
      "Dashboard",
      "Wallet",
      "Ledger",
    ]);
    expect(deriveBreadcrumbs("/dashboard/discounts/coupons").map((c) => c.label)).toEqual([
      "Dashboard",
      "Discounts",
      "Coupons",
    ]);
  });
  it("keeps the Settings crumb for pages still under Settings", () => {
    expect(deriveBreadcrumbs("/dashboard/settings/lead-sources").map((c) => c.label)).toEqual([
      "Dashboard",
      "Settings",
      "Lead sources",
    ]);
  });
  it("applies an override for a dynamic segment", () => {
    const crumbs = deriveBreadcrumbs("/dashboard/inquiries/inq_abc", { inq_abc: "Riya Anand" });
    expect(crumbs.map((c) => c.label)).toEqual(["Dashboard", "Inquiries", "Riya Anand"]);
  });
});
