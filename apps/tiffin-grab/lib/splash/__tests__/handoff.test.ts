import { describe, expect, it } from "vitest";
import { apexOf, splashCookie, splashInitScript, SPLASH_FLAG } from "../handoff";

describe("splash hand-off", () => {
  it("finds the apex both hosts share", () => {
    expect(apexOf("app.tiffingrab.ca")).toBe("tiffingrab.ca");
    expect(apexOf("tiffingrab.ca")).toBe("tiffingrab.ca");
    expect(apexOf("www.tiffingrab.ca")).toBe("tiffingrab.ca");
  });

  it("has no apex where a cookie cannot span hosts", () => {
    expect(apexOf("localhost")).toBeNull();
    expect(apexOf("127.0.0.1")).toBeNull();
  });

  it("scopes the flag to the apex so the page on the other host sees it, briefly", () => {
    const c = splashCookie("tiffingrab.ca", true);
    expect(c).toContain(`${SPLASH_FLAG}=1`);
    expect(c).toContain("Domain=.tiffingrab.ca");
    expect(c).toContain("Secure");
    expect(c).toMatch(/Max-Age=\d{1,2};/);
  });

  it("keeps the flag host-only on localhost", () => {
    expect(splashCookie(null, false)).not.toContain("Domain=");
  });

  it("the head script marks <html> only when the flag is up", () => {
    const run = (cookie: string) => {
      const attrs: Record<string, string> = {};
      const doc = { cookie, documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
      new Function("document", "sessionStorage", splashInitScript)(doc, { getItem: () => null });
      return attrs["data-splash"];
    };
    expect(run(`a=1; ${SPLASH_FLAG}=1`)).toBe("arrive");
    expect(run("a=1")).toBeUndefined();
  });
});
