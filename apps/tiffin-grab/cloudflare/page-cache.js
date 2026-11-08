// Edge cache for the apex public pages. A zone Cache Rule cannot do this: Workers run before the
// Cloudflare cache, so rules only touch the Worker's own subrequests, never its response. Same
// eligibility the old rule had (scripts/cloudflare-cache.mjs): plain GETs of public-pages.json, no
// query (?ref= sets a cookie, _rsc is router data), no franchise cookie, no Next router headers
// (router data shares the page URL, and the key ignores headers). Deploy's purge-by-URL clears these.
import publicPages from "../lib/routing/public-pages.json";
import { SESSION_COOKIES, SESSION_HINT_COOKIE } from "../lib/auth/cookie-prefix.ts";

const HOST = "tiffingrab.ca";
const PAGES = new Set(publicPages);
const ROUTER_HEADERS = ["rsc", "next-router-prefetch", "next-router-state-tree", "next-url"];
// Matches next.config.ts s-maxage. Cache API ignores s-maxage, so the stored copy carries max-age.
const EDGE_TTL_S = 60;
const ORIGIN_CC = "x-origin-cache-control";

export function isCacheablePage(request) {
  if (request.method !== "GET") return false;
  // The key ignores headers, so an agent's markdown request (proxy.ts serves it) must not share the page's HTML.
  if (/text\/markdown/i.test(request.headers.get("accept") ?? "")) return false;
  const url = new URL(request.url);
  if (url.host !== HOST || url.search !== "" || !PAGES.has(url.pathname)) return false;
  const cookies = cookieNames(request.headers.get("cookie"));
  if (cookies.has("franchise")) return false;
  // A hit skips proxy.ts, which keeps the session hint in step; send a mismatch through so it can.
  const hasSession = SESSION_COOKIES.some((n) => cookies.has(n));
  if (hasSession !== (cookies.get(SESSION_HINT_COOKIE) === "1")) return false;
  return !ROUTER_HEADERS.some((h) => request.headers.has(h));
}

function cookieNames(header) {
  const out = new Map();
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return out;
}

export async function cachedPage(request, ctx, render, cache = caches.default) {
  const key = new Request(request.url, { method: "GET" });
  const hit = await cache.match(key);
  if (hit) {
    const out = new Response(hit.body, hit);
    // Browsers get the origin's max-age=0 back, so they still revalidate every navigation.
    out.headers.set("cache-control", hit.headers.get(ORIGIN_CC) ?? "public, max-age=0, must-revalidate");
    out.headers.delete(ORIGIN_CC);
    return out;
  }
  const res = await render();
  const cc = res.headers.get("cache-control") ?? "";
  // Only what Next itself marked public; never a response that sets a cookie.
  if (res.status !== 200 || !/\bpublic\b/.test(cc) || res.headers.has("set-cookie")) return res;
  const stored = new Response(res.clone().body, res);
  stored.headers.set(ORIGIN_CC, cc);
  stored.headers.set("cache-control", `public, max-age=${EDGE_TTL_S}`);
  ctx.waitUntil(cache.put(key, stored));
  return res;
}
