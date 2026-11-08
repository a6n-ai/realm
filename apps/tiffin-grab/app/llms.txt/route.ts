import { reviewsConnected } from "@/components/landing/landing-reviews";
import { llmsTxt } from "@/lib/landing/llms-text";
import { loadSiteFacts } from "@/lib/landing/site-facts";
import { publicOrigin } from "@/lib/routing/apex";

// Follows the live catalog like the public pages; five minutes keeps it close without a DB read per hit.
export const dynamic = "force-static";
export const revalidate = 300;

export async function GET() {
  const [facts, reviews] = await Promise.all([loadSiteFacts(), reviewsConnected()]);
  return new Response(llmsTxt(facts, publicOrigin(), { reviews }), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
