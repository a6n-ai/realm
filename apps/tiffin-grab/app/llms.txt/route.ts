import { reviewsConnected } from "@/components/landing/landing-reviews";
import { llmsTxt } from "@/lib/landing/llms-text";
import { loadSiteFacts } from "@/lib/landing/site-facts";
import { publicOrigin } from "@/lib/routing/apex";

// Rendered per request like app/sitemap.ts: a static route would read the catalog at build time, and
// the CI build has no database. The edge keeps each answer for five minutes.
export const dynamic = "force-dynamic";
const HEADERS = { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600" };

export async function GET() {
  const [facts, reviews] = await Promise.all([loadSiteFacts(), reviewsConnected()]);
  return new Response(llmsTxt(facts, publicOrigin(), { reviews }), { headers: HEADERS });
}
