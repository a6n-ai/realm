import { describe, expect, it } from "vitest";
import { landingPathFor } from "../landing";

describe("landingPathFor", () => {
  it("sends a customer to their own area", () => {
    expect(landingPathFor("user")).toBe("/me");
  });

  it("sends an admin to the dashboard", () => {
    expect(landingPathFor("admin")).toBe("/dashboard");
  });

  it("sends a member to the dashboard now that it has pages for them", () => {
    expect(landingPathFor("member")).toBe("/dashboard");
  });

  it("lets a member follow a dashboard callback", () => {
    expect(landingPathFor("member", "/dashboard/orders")).toBe("/dashboard/orders");
  });

  it("still sends an unknown role to the customer area, never the console", () => {
    expect(landingPathFor("something-new")).toBe("/me");
  });

  it("treats an unknown or missing role as a customer", () => {
    expect(landingPathFor(null)).toBe("/me");
    expect(landingPathFor(undefined)).toBe("/me");
    expect(landingPathFor("something-new")).toBe("/me");
  });

  it("honours a same-site callback the role may actually reach", () => {
    expect(landingPathFor("admin", "/dashboard/orders")).toBe("/dashboard/orders");
    expect(landingPathFor("user", "/me/orders")).toBe("/me/orders");
  });

  it("refuses a callback the role cannot reach, rather than looping", () => {
    expect(landingPathFor("user", "/dashboard/orders")).toBe("/me");
    expect(landingPathFor("admin", "/me/orders")).toBe("/dashboard");
    expect(landingPathFor("member", "/me/orders")).toBe("/dashboard");
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
