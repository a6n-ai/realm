// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { leavesHost } from "../cross-host-splash";

const link = (href: string, attrs: Record<string, string> = {}) => {
  const a = document.createElement("a");
  a.href = href;
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  return a;
};
const apex = new URL("https://tiffingrab.ca/");
const app = new URL("https://app.tiffingrab.ca/me");

describe("leavesHost", () => {
  it.each(["/subscribe", "/login", "/me", "/checkout?x=1"])("apex link %s is redirected to app", (p) => {
    expect(leavesHost(link(`https://tiffingrab.ca${p}`), apex)).toBe(true);
  });
  it.each(["/", "/menu/weekly", "/plans", "/faq"])("apex page %s stays on the apex", (p) => {
    expect(leavesHost(link(`https://tiffingrab.ca${p}`), apex)).toBe(false);
  });
  it("app to apex and apex to app leave the host", () => {
    expect(leavesHost(link("https://tiffingrab.ca/"), app)).toBe(true);
    expect(leavesHost(link("https://app.tiffingrab.ca/me"), apex)).toBe(true);
  });
  it("in-app links, new tabs, downloads and other sites do not", () => {
    expect(leavesHost(link("https://app.tiffingrab.ca/me/wallet"), app)).toBe(false);
    expect(leavesHost(link("https://app.tiffingrab.ca/me", { target: "_blank" }), apex)).toBe(false);
    expect(leavesHost(link("https://tiffingrab.ca/api/receipts/x", { download: "" }), apex)).toBe(false);
    expect(leavesHost(link("https://wa.me/123"), apex)).toBe(false);
    expect(leavesHost(link("mailto:hi@tiffingrab.ca"), apex)).toBe(false);
  });
  it("is inert on localhost", () => {
    expect(leavesHost(link("http://localhost:3000/login"), new URL("http://localhost:3000/"))).toBe(false);
  });
});
