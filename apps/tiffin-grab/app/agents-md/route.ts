import type { NextRequest } from "next/server";
import { reviewsConnected } from "@/components/landing/landing-reviews";
import { areasMd, faqMd, tokenEstimate } from "@/lib/landing/agent-markdown";
import { loadFaqGroups } from "@/lib/landing/faq-data";
import { llmsTxt, pricingMd } from "@/lib/landing/llms-text";
import { loadSiteFacts } from "@/lib/landing/site-facts";
import { publicOrigin } from "@/lib/routing/apex";

// Internal: proxy.ts rewrites a public page asked for as text/markdown here, naming it in x-md-path. Not linked,
// and the apex 404s it if requested directly. Per request like the sitemap; the edge keeps it 5 minutes.
export const dynamic = "force-dynamic";

async function markdownFor(path: string): Promise<string | null> {
  const origin = publicOrigin();
  if (path === "/faq") return faqMd(await loadFaqGroups(null), origin);
  const facts = await loadSiteFacts();
  if (path === "/pricing") return pricingMd(facts, origin);
  if (path === "/locations") return areasMd(facts, origin);
  if (path === "/") return llmsTxt(facts, origin, { reviews: await reviewsConnected() });
  return null;
}

export async function GET(request: NextRequest) {
  const md = await markdownFor(request.headers.get("x-md-path") ?? "");
  if (md == null) return new Response("Not found", { status: 404 });
  return new Response(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      vary: "Accept",
      "x-markdown-tokens": String(tokenEstimate(md)),
      "content-signal": "search=yes, ai-input=yes, ai-train=yes",
      "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
