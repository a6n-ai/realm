import { pricingMd } from "@/lib/landing/llms-text";
import { loadSiteFacts } from "@/lib/landing/site-facts";
import { publicOrigin } from "@/lib/routing/apex";

// Rendered per request like app/sitemap.ts: a static route would read the catalog at build time, and
// the CI build has no database. The edge keeps each answer for five minutes.
export const dynamic = "force-dynamic";
const HEADERS = { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600" };

export async function GET() {
  return new Response(pricingMd(await loadSiteFacts(), publicOrigin()), { headers: HEADERS });
}
