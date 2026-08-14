import { describe, expect, it } from "vitest";
import { landingPathFor } from "../landing";

describe("landingPathFor", () => {
  it("sends a customer to their own area", () => {
    expect(landingPathFor("user")).toBe("/me");
  });

  it("sends staff to the dashboard", () => {
    expect(landingPathFor("admin")).toBe("/dashboard");
    expect(landingPathFor("member")).toBe("/dashboard");
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
