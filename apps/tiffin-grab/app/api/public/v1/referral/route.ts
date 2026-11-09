import { loadReferralOffer } from "@/lib/referrals/offer";
import { referralBody } from "@/lib/public-api/data";
import { publicOrigin } from "@/lib/routing/apex";
import { publicJson } from "@/lib/public-api/respond";
export const dynamic = "force-dynamic";

export async function GET() {
  return publicJson(referralBody(await loadReferralOffer(), publicOrigin()));
}
