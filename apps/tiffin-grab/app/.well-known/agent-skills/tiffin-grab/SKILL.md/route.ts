import { agentSkillMd } from "@/lib/public-api/discovery";
import { publicOrigin } from "@/lib/routing/apex";

export const dynamic = "force-static";

export const GET = () =>
  new Response(agentSkillMd(publicOrigin()), {
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600", "access-control-allow-origin": "*" },
  });
