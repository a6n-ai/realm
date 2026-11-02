import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

vi.mock("./db/client", () => ({
  db: { select: () => ({ from: async () => [{ id: "org1", clientCode: "main", isDefault: true }] }) },
}));

const get = (url: string) => proxy(new NextRequest(url));

beforeEach(() => vi.stubEnv("BETTER_AUTH_URL", "https://app.tiffingrab.ca"));
afterEach(() => vi.unstubAllEnvs());

describe("apex/www front door", () => {
  it("308s www to the apex keeping path and query", async () => {
    const res = await get("https://www.tiffingrab.ca/menu/weekly?a=1");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://tiffingrab.ca/menu/weekly?a=1");
  });

  it("308s www even for a non-allowlisted path (www rule runs first)", async () => {
    const res = await get("https://www.tiffingrab.ca/me");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://tiffingrab.ca/me");
  });

  it.each([
    "/menu/weekly", "/sitemap.xml", "/", "/pricing", "/terms-and-conditions/", "/legal/", "/robots.txt",
    "/api/files/a/b.jpg", "/lottie/x.json", "/uploads/x.png", "/landing/figure.json", "/favicon.ico",
    "/logo.svg", "/opengraph-image.png", "/twitter-image.png", "/_next/static/x.js",
  ])("passes %s through to the app on the apex", async (p) => {
    const res = await get(`https://tiffingrab.ca${p}`);
    expect(res.headers.get("location")).toBeNull();
  });

  it.each([
    ["/me", "https://app.tiffingrab.ca/me"],
    ["/dashboard?x=1", "https://app.tiffingrab.ca/dashboard?x=1"],
    ["/login", "https://app.tiffingrab.ca/login"],
    ["/menus", "https://app.tiffingrab.ca/menus"],
    ["/product/thali", "https://app.tiffingrab.ca/product/thali"],
  ])("302s %s on the apex to app", async (p, to) => {
    const res = await get(`https://tiffingrab.ca${p}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(to);
  });

  it("does not serve retired WordPress paths from the app", async () => {
    const res = await get("https://tiffingrab.ca/wp-admin/");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://app.tiffingrab.ca/wp-admin/");
  });

  it("leaves the app host alone", async () => {
    const res = await get("https://app.tiffingrab.ca/me");
    expect(res.headers.get("location")).toContain("/login");
    expect(res.headers.get("location")).not.toContain("tiffingrab.ca/me");
  });

  it("is inert when the app host is not app.<apex> (local dev)", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    const res = await get("http://localhost:3000/me");
    expect(res.headers.get("location")).toContain("/login");
  });
});
