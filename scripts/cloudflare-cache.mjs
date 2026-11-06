#!/usr/bin/env node
// Purge tiffin-grab's edge-cached public pages (apex only). Run after every deploy, or a cached page
// would point at the previous build's deleted chunks. The cache itself lives in the Worker
// (apps/tiffin-grab/cloudflare/page-cache.js): Workers run before the zone cache, so a Cache Rule
// cannot cache a Worker's response.
//   node scripts/cloudflare-cache.mjs purge
// Env: CLOUDFLARE_API_TOKEN with Zone > Cache Purge: Purge.
import { readFileSync } from "node:fs";

const ZONE = "tiffingrab.ca";
const pages = JSON.parse(readFileSync(new URL("../apps/tiffin-grab/lib/routing/public-pages.json", import.meta.url), "utf8"));
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set");

async function api(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!body.success) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${JSON.stringify(body.errors ?? body)}`);
  return body.result;
}

if (process.argv[2] !== "purge") throw new Error("usage: cloudflare-cache.mjs purge");
const zoneId = (await api(`/zones?name=${ZONE}`))[0]?.id;
if (!zoneId) throw new Error(`zone ${ZONE} not found`);
await api(`/zones/${zoneId}/purge_cache`, { method: "POST", body: JSON.stringify({ files: pages.map((p) => `https://${ZONE}${p}`) }) });
console.log(`purged ${pages.length} public pages`);
