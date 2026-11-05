#!/usr/bin/env node
// Cloudflare edge cache for tiffin-grab's public pages (apex only).
//   node scripts/cloudflare-cache.mjs rule    create or update the zone cache rule (other rules untouched)
//   node scripts/cloudflare-cache.mjs purge   purge those pages: run after every deploy, or a cached page
//                                             would point at the previous build's deleted chunks
// Env: CLOUDFLARE_API_TOKEN with Zone > Cache Rules: Edit and Zone > Cache Purge: Purge.
import { readFileSync } from "node:fs";

const ZONE = "tiffingrab.ca";
const REF = "tg-public-pages";
const ROUTER_HEADERS = ["rsc", "next-router-prefetch", "next-router-state-tree", "next-url"];
const pages = JSON.parse(readFileSync(new URL("../apps/tiffin-grab/lib/routing/public-pages.json", import.meta.url), "utf8"));
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set");

async function api(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!body.success) {
    const err = new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${JSON.stringify(body.errors ?? body)}`);
    err.status = res.status;
    throw err;
  }
  return body.result;
}

const zoneId = (await api(`/zones?name=${ZONE}`))[0]?.id;
if (!zoneId) throw new Error(`zone ${ZONE} not found`);

const cmd = process.argv[2];
if (cmd === "rule") {
  // Plain GETs of the public paths only: a query (?ref= sets a cookie, _rsc is router data) or a
  // franchise cookie (a visitor who picked a non-default franchise) always reaches the Worker.
  // Next answers the same URL with router data (not HTML) when these headers are present; the
  // cache key ignores headers, so one such request could otherwise store router data as the page
  // for everyone. http.request.headers keys are lowercase; a missing header makes [0] compare false.
  const rule = {
    ref: REF,
    description: "tiffin-grab public pages: edge cache per origin Cache-Control (scripts/cloudflare-cache.mjs)",
    expression: `(http.host eq "${ZONE}" and http.request.method eq "GET" and http.request.uri.path in {${pages.map((p) => JSON.stringify(p)).join(" ")}} and http.request.uri.query eq "" and not http.cookie contains "franchise="${ROUTER_HEADERS.map((h) => ` and not http.request.headers["${h}"][0] ne ""`).join("")})`,
    action: "set_cache_settings",
    action_parameters: { cache: true, edge_ttl: { mode: "respect_origin" }, browser_ttl: { mode: "respect_origin" } },
    enabled: true,
  };
  let ruleset;
  try {
    ruleset = await api(`/zones/${zoneId}/rulesets/phases/http_request_cache_settings/entrypoint`);
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  if (!ruleset) {
    await api(`/zones/${zoneId}/rulesets`, { method: "POST", body: JSON.stringify({ name: "default", kind: "zone", phase: "http_request_cache_settings", rules: [rule] }) });
    console.log("cache rule created (new ruleset)");
  } else {
    const existing = (ruleset.rules ?? []).find((r) => r.ref === REF);
    if (existing) await api(`/zones/${zoneId}/rulesets/${ruleset.id}/rules/${existing.id}`, { method: "PATCH", body: JSON.stringify(rule) });
    else await api(`/zones/${zoneId}/rulesets/${ruleset.id}/rules`, { method: "POST", body: JSON.stringify(rule) });
    console.log(existing ? "cache rule updated" : "cache rule added");
  }
} else if (cmd === "purge") {
  await api(`/zones/${zoneId}/purge_cache`, { method: "POST", body: JSON.stringify({ files: pages.map((p) => `https://${ZONE}${p}`) }) });
  console.log(`purged ${pages.length} public pages`);
} else {
  throw new Error("usage: cloudflare-cache.mjs rule|purge");
}
