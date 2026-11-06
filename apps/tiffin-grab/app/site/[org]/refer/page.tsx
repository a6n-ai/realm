import type { Metadata } from "next";
import { ReferContent, referHeadline } from "@/components/landing/refer/refer-content";
import { pageMeta } from "@/lib/landing/meta";
import { loadReferralOffer } from "@/lib/referrals/offer";
import { siteOrgId } from "@/lib/tenant/site-org";
import "@/components/landing/styles/refer.css";

// Reward settings change rarely; five minutes keeps the figures close to live without a DB read per view.
export const revalidate = 300;
export const dynamic = "error";

export async function generateMetadata(): Promise<Metadata> {
  const offer = await loadReferralOffer();
  const description = offer.on ? `${referHeadline(offer)} Share your TiffinGrab link; when a friend pays for their first plan, you both get coins.` : "TiffinGrab referrals are paused right now.";
  return pageMeta("Refer a friend | Tiffin Grab", description, "/refer");
}

export default async function ReferPage({ params }: { params: Promise<{ org: string }> }) {
  await siteOrgId((await params).org);
  return <ReferContent offer={await loadReferralOffer()} />;
}
