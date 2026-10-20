import { describe, expect, it } from "vitest";
import { afterSignupPath, landingPathFor, safeCallback, signupHref } from "../landing";

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
    expect(landingPathFor("user", "/whats-on")).toBe("/whats-on");
    expect(landingPathFor("user", "/whats-on?book=stn_abc")).toBe("/whats-on?book=stn_abc");
  });

  it("refuses a callback the role cannot reach, rather than looping", () => {
    expect(landingPathFor("user", "/dashboard")).toBe("/me");
    expect(landingPathFor("admin", "/me/account")).toBe("/dashboard");
    expect(landingPathFor("admin", "/whats-on")).toBe("/dashboard");
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

describe("safeCallback", () => {
  const of = (q: string) => safeCallback(new URLSearchParams(q));
  it("keeps same-site paths from callbackUrl or next", () => {
    expect(of("next=/me/book?session=x")).toBe("/me/book?session=x");
    expect(of("callbackUrl=/dashboard")).toBe("/dashboard");
    expect(of("next=/me")).toBe("/me");
    expect(of("next=/me/book?session=abc")).toBe("/me/book?session=abc");
  });
  it("drops off-site targets", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/ /evil.com"]) {
      expect(of(`next=${encodeURIComponent(bad)}`)).toBeNull();
      expect(of(`callbackUrl=${encodeURIComponent(bad)}`)).toBeNull();
    }
  });
});

describe("signup hop", () => {
  it("carries a same-site target into the signup link", () => {
    expect(signupHref("/whats-on/x?session=1")).toBe("/signup?next=%2Fwhats-on%2Fx%3Fsession%3D1");
    expect(signupHref(null)).toBe("/signup");
    expect(signupHref("//evil.test")).toBe("/signup");
  });

  it("flags a refused Google sign-up without dropping the picked session", () => {
    expect(signupHref(null, { error: "signup_disabled" })).toBe("/signup?error=signup_disabled");
    expect(signupHref("/me/book?session=x", { error: "signup_disabled" })).toBe(
      "/signup?next=%2Fme%2Fbook%3Fsession%3Dx&error=signup_disabled",
    );
  });

  it("lands a new family on the target, else the welcome page", () => {
    expect(afterSignupPath("/me/book?session=abc")).toBe("/me/book?session=abc");
    expect(afterSignupPath(null)).toBe("/me/welcome");
    expect(afterSignupPath("/dashboard")).toBe("/me/welcome");
    expect(afterSignupPath("//evil.test")).toBe("/me/welcome");
  });
});
