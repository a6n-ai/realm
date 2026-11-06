import { describe, expect, it, vi } from "vitest";
import { cachedPage, isCacheablePage } from "./page-cache.js";

const req = (url: string, headers: Record<string, string> = {}, method = "GET") => new Request(url, { method, headers });

function fakeCache() {
  const store = new Map<string, Response>();
  return {
    store,
    match: async (k: Request) => store.get(k.url)?.clone(),
    put: async (k: Request, r: Response) => void store.set(k.url, r),
  };
}
const ctx = () => {
  const pending: Promise<unknown>[] = [];
  return { pending, waitUntil: (p: Promise<unknown>) => pending.push(p) };
};
const page = (headers: Record<string, string> = {}) =>
  new Response("<html>", { status: 200, headers: { "cache-control": "public, max-age=0, must-revalidate, s-maxage=60", ...headers } });

describe("isCacheablePage", () => {
  it("accepts a plain GET of a public apex page", () => {
    expect(isCacheablePage(req("https://tiffingrab.ca/pricing"))).toBe(true);
    expect(isCacheablePage(req("https://tiffingrab.ca/"))).toBe(true);
  });

  it.each([
    ["other host", req("https://app.tiffingrab.ca/pricing")],
    ["non-public path", req("https://tiffingrab.ca/me")],
    ["query string", req("https://tiffingrab.ca/pricing?ref=ABC")],
    ["router data", req("https://tiffingrab.ca/pricing", { rsc: "1" })],
    ["prefetch", req("https://tiffingrab.ca/pricing", { "next-router-prefetch": "1" })],
    ["franchise cookie", req("https://tiffingrab.ca/pricing", { cookie: "a=1; franchise=north" })],
    ["POST", req("https://tiffingrab.ca/pricing", {}, "POST")],
    ["session without hint", req("https://tiffingrab.ca/pricing", { cookie: "__Secure-tiffingrab.session_token=x" })],
    ["hint without session", req("https://tiffingrab.ca/pricing", { cookie: "tg_signed_in=1" })],
  ])("rejects %s", (_, r) => expect(isCacheablePage(r)).toBe(false));

  it("accepts a signed-in visitor whose hint is in step", () => {
    expect(isCacheablePage(req("https://tiffingrab.ca/pricing", { cookie: "tiffingrab.session_token=x; tg_signed_in=1" }))).toBe(true);
  });
});

describe("cachedPage", () => {
  it("renders once, then serves the stored copy with the origin Cache-Control", async () => {
    const cache = fakeCache();
    const render = vi.fn(async () => page());
    const c = ctx();
    const first = await cachedPage(req("https://tiffingrab.ca/pricing"), c, render, cache);
    await Promise.all(c.pending);
    expect(await first.text()).toBe("<html>");
    expect(cache.store.get("https://tiffingrab.ca/pricing")?.headers.get("cache-control")).toBe("public, max-age=60");

    const second = await cachedPage(req("https://tiffingrab.ca/pricing"), ctx(), render, cache);
    expect(render).toHaveBeenCalledTimes(1);
    expect(await second.text()).toBe("<html>");
    expect(second.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate, s-maxage=60");
    expect(second.headers.has("x-origin-cache-control")).toBe(false);
  });

  it.each([
    ["non-200", new Response("x", { status: 404, headers: { "cache-control": "public" } })],
    ["private", new Response("x", { status: 200, headers: { "cache-control": "private, no-cache" } })],
    ["set-cookie", page({ "set-cookie": "ref=ABC" })],
  ])("never stores a %s response", async (_, res) => {
    const cache = fakeCache();
    const c = ctx();
    await cachedPage(req("https://tiffingrab.ca/pricing"), c, async () => res, cache);
    await Promise.all(c.pending);
    expect(cache.store.size).toBe(0);
  });
});
