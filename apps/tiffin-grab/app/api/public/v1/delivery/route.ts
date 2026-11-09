import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { loadSiteFacts } from "@/lib/landing/site-facts";
import { deliveryBody } from "@/lib/public-api/data";
import { publicOrigin } from "@/lib/routing/apex";
import { publicJson } from "@/lib/public-api/respond";
export const dynamic = "force-dynamic";

export async function GET() {
  const [facts, catalog] = await Promise.all([loadSiteFacts(), loadCatalogSnapshot()]);
  return publicJson(deliveryBody(facts, catalog, publicOrigin()));
}
