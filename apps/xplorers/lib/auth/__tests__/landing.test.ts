import { describe, expect, it } from "vitest";
import { landingPathFor } from "../landing";

describe("landingPathFor", () => {
  it("sends a customer to their own area", () => {
    expect(landingPathFor("user")).toBe("/me");
  });

  it("sends an admin to the dashboard", () => {
    expect(landingPathFor("admin")).toBe("/dashboard");
  });

  it("sends a member to the dashboard", () => {
    expect(landingPathFor("member")).toBe("/dashboard");
  });

  it("lets a member follow a dashboard callback", () => {
    expect(landingPathFor("member", "/dashboard/settings/users")).toBe("/dashboard/settings/users");
  });

  it("still sends an unknown role to the customer area, never the console", () => {
    expect(landingPathFor("something-new")).toBe("/me");
  });

  it("treats an unknown or missing role as a customer", () => {
    expect(landingPathFor(null)).toBe("/me");
    expect(landingPathFor(undefined)).toBe("/me");
  });

  it("honours a same-site callback the role may actually reach", () => {
    expect(landingPathFor("admin", "/dashboard/account")).toBe("/dashboard/account");
    expect(landingPathFor("user", "/me/account")).toBe("/me/account");
  });

  it("refuses a callback the role cannot reach, rather than looping", () => {
    expect(landingPathFor("user", "/dashboard")).toBe("/me");
    expect(landingPathFor("admin", "/me/account")).toBe("/dashboard");
    expect(landingPathFor("member", "/me")).toBe("/dashboard");
  });

  it("refuses a callback that merely shares the home path's prefix", () => {
    expect(landingPathFor("admin", "/dashboardster")).toBe("/dashboard");
  });

  it.each(["https://evil.example.com/phish", "//evil.example.com", "/\\evil.example.com", "javascript:alert(1)"])(
    "refuses the off-site callback %s",
    (callback) => {
      expect(landingPathFor("admin", callback)).toBe("/dashboard");
    },
  );
});
