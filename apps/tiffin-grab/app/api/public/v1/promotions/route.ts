import { loadLandingPromos } from "@/lib/landing/promos";
import { promotionsBody } from "@/lib/public-api/data";
import { publicOrigin } from "@/lib/routing/apex";
import { publicJson } from "@/lib/public-api/respond";
export const dynamic = "force-dynamic";

export async function GET() {
  return publicJson(promotionsBody(await loadLandingPromos(), publicOrigin()));
}
