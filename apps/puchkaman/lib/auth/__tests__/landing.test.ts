import { describe, expect, it } from "vitest";
import { landingPathFor } from "../landing";

describe("landingPathFor", () => {
  it("sends a customer to their own area", () => {
    expect(landingPathFor("user")).toBe("/me");
  });

  it("sends an admin to the dashboard", () => {
    expect(landingPathFor("admin")).toBe("/dashboard");
  });

  // Every /dashboard page calls requireAdmin, so routing `member` there is a 500.
  it("sends a member to the no-access explainer", () => {
    expect(landingPathFor("member")).toBe("/no-access");
  });

  it("treats an unknown or missing role as a customer", () => {
    expect(landingPathFor(null)).toBe("/me");
    expect(landingPathFor(undefined)).toBe("/me");
    expect(landingPathFor("something-new")).toBe("/me");
  });

  it("honours a same-site callback the role may actually reach", () => {
    expect(landingPathFor("admin", "/dashboard/orders")).toBe("/dashboard/orders");
    expect(landingPathFor("user", "/me/orders")).toBe("/me/orders");
    expect(landingPathFor("member", "/no-access")).toBe("/no-access");
  });

  it("refuses a callback the role cannot reach, rather than looping", () => {
    expect(landingPathFor("user", "/dashboard/orders")).toBe("/me");
    expect(landingPathFor("admin", "/me/orders")).toBe("/dashboard");
    expect(landingPathFor("member", "/dashboard/orders")).toBe("/no-access");
    expect(landingPathFor("member", "/me/orders")).toBe("/no-access");
  });

  // "/dashboardster" starts with the home path but is a different route.
  it("refuses a callback that merely shares the home path's prefix", () => {
    expect(landingPathFor("admin", "/dashboardster")).toBe("/dashboard");
  });

  it.each([
    "https://evil.example.com/phish",
    "//evil.example.com",
    "/\\evil.example.com",
    "javascript:alert(1)",
  ])("refuses the off-site callback %s", (callback) => {
    expect(landingPathFor("admin", callback)).toBe("/dashboard");
  });
});
