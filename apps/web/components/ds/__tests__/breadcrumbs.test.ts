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
  it("applies an override for a dynamic segment", () => {
    const crumbs = deriveBreadcrumbs("/dashboard/inquiries/inq_abc", { inq_abc: "Riya Anand" });
    expect(crumbs.map((c) => c.label)).toEqual(["Dashboard", "Inquiries", "Riya Anand"]);
  });
});
