import { docsMarkdown } from "@/lib/public-api/openapi";
import { publicOrigin } from "@/lib/routing/apex";

export const dynamic = "force-dynamic";

export const GET = () =>
  new Response(docsMarkdown(publicOrigin()), {
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600", "access-control-allow-origin": "*" },
  });
