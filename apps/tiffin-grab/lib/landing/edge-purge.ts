import publicPages from "@/lib/routing/public-pages.json";
import { edgePurgeToken } from "@/lib/runtime/env";

// The Worker keeps the apex pages in the edge cache (cloudflare/page-cache.js) for an hour once this token is
// set, so every site edit and promo/cutoff boundary has to clear them. Purge-by-URL is the only way to reach
// Cache API entries in every colo. Token: a zone token with only Cache Purge on tiffingrab.ca.
const ZONE_ID = "970680dc711f59ee1bb17ff536b1c61b";
const HOST = "tiffingrab.ca";

export async function purgeEdgePages({ fetcher = fetch, delayMs = 3000 } = {}): Promise<boolean> {
  const token = edgePurgeToken();
  if (!token) return false;
  // Let revalidatePath land first: a visitor in between would put the old page back for the full hour.
  await new Promise((r) => setTimeout(r, delayMs));
  const res = await fetcher(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ files: publicPages.map((p) => `https://${HOST}${p}`) }),
  });
  if (!res.ok) throw new Error(`edge purge failed: ${res.status}`);
  return true;
}
