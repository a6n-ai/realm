import { loadSiteFacts } from "@/lib/landing/site-facts";
import { plansBody } from "@/lib/public-api/data";
import { publicOrigin } from "@/lib/routing/apex";
import { publicJson } from "@/lib/public-api/respond";
export const dynamic = "force-dynamic";

export async function GET() {
  return publicJson(plansBody(await loadSiteFacts(), publicOrigin()));
}
