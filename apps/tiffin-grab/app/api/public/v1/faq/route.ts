import { loadFaqGroups } from "@/lib/landing/faq-data";
import { faqBody } from "@/lib/public-api/data";
import { publicOrigin } from "@/lib/routing/apex";
import { publicJson } from "@/lib/public-api/respond";
export const dynamic = "force-dynamic";

export async function GET() {
  return publicJson(faqBody(await loadFaqGroups(null), publicOrigin()));
}
