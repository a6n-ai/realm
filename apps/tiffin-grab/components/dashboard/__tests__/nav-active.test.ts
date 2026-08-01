import { describe, expect, it } from "vitest";
import { activeNavHref } from "../nav-active";

const HREFS = [
  "/dashboard",
  "/dashboard/orders",
  "/dashboard/orders?status=ongoing",
  "/dashboard/customers",
];

const at = (pathname: string, qs = "") =>
  activeNavHref(HREFS, pathname, new URLSearchParams(qs));

describe("activeNavHref", () => {
  it("lights the saved view, not its parent, on an exact match", () => {
    expect(at("/dashboard/orders", "status=ongoing")).toBe("/dashboard/orders?status=ongoing");
  });

  it("keeps the saved view lit while paging and searching inside it", () => {
    expect(at("/dashboard/orders", "status=ongoing&page=2&q=raj")).toBe(
      "/dashboard/orders?status=ongoing",
    );
  });

  it("hands the highlight back to the parent when the view's params stop matching", () => {
    expect(at("/dashboard/orders", "status=cancelled")).toBe("/dashboard/orders");
    expect(at("/dashboard/orders")).toBe("/dashboard/orders");
  });

  it("keeps the parent lit on its own detail routes", () => {
    expect(at("/dashboard/orders/42")).toBe("/dashboard/orders");
  });

  it("matches /dashboard exactly so it does not swallow every child route", () => {
    expect(at("/dashboard")).toBe("/dashboard");
    expect(at("/dashboard/customers")).toBe("/dashboard/customers");
  });

  it("returns null off-nav", () => {
    expect(at("/me/wallet")).toBeNull();
  });

  it("prefers the deepest owning row", () => {
    const nested = ["/dashboard/settings", "/dashboard/settings/integrations"];
    expect(activeNavHref(nested, "/dashboard/settings/integrations", new URLSearchParams())).toBe(
      "/dashboard/settings/integrations",
    );
  });
});
