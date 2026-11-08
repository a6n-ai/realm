import { pricingMd } from "@/lib/landing/llms-text";
import { loadSiteFacts } from "@/lib/landing/site-facts";
import { publicOrigin } from "@/lib/routing/apex";

export const dynamic = "force-static";
export const revalidate = 300;

export async function GET() {
  return new Response(pricingMd(await loadSiteFacts(), publicOrigin()), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
