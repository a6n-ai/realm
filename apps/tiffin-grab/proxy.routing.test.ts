import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "./proxy";

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

  it("matches case-insensitively like Caddy", async () => {
    expect((await get("https://tiffingrab.ca/PRICING")).headers.get("location")).toBeNull();
    expect((await get("https://tiffingrab.ca/ME")).status).toBe(302);
  });

  it("302s extension paths that are not allowlisted, serves allowlisted ones", async () => {
    expect((await get("https://tiffingrab.ca/wp-content/uploads/x.jpg")).status).toBe(302);
    expect((await get("https://tiffingrab.ca/manifest.json")).status).toBe(302);
    for (const p of ["/logo.svg", "/robots.txt", "/sitemap.xml", "/_next/static/a.js", "/favicon.ico"]) {
      expect((await get(`https://tiffingrab.ca${p}`)).headers.get("location")).toBeNull();
    }
  });

  it("does not set the referral cookie on front-door redirects", async () => {
    const res = await get("https://www.tiffingrab.ca/menu?ref=ABCDEF");
    expect(res.headers.get("set-cookie")).toBeNull();
    // control: the same code does set the cookie on a normal response
    expect((await get("https://tiffingrab.ca/menu?ref=ABCDEF")).headers.get("set-cookie")).toContain("ABCDEF");
  });

  it("matcher has a host entry so static-looking apex paths reach the proxy", () => {
    const hostEntry = (config.matcher as unknown[]).find((m) => typeof m === "object") as { has: { type: string; key: string; value: string }[] };
    expect(hostEntry.has[0]).toMatchObject({ type: "header", key: "host" });
    const re = new RegExp(`^${hostEntry.has[0].value}$`);
    expect(["tiffingrab.ca", "www.tiffingrab.ca"].every((h) => re.test(h))).toBe(true);
    expect(re.test("app.tiffingrab.ca")).toBe(false);
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
