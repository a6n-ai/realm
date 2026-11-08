import type { Metadata } from "next";
import { FriendWelcome } from "@/components/landing/refer/friend-welcome";
import { friendHeadline } from "@/components/landing/refer/friend-copy";
import { ReferContent } from "@/components/landing/refer/refer-content";
import { pageMeta } from "@/lib/landing/meta";
import { loadLandingPromos } from "@/lib/landing/promos";
import { loadReferralOffer } from "@/lib/referrals/offer";
import { isReferralCodeShape, normalizeReferralCode } from "@/lib/referrals/cookie";
import { referCardPath } from "@/lib/referrals/share";
import { findReferrerByCode } from "@/lib/services/referrals.service";
import { siteOrgId } from "@/lib/tenant/site-org";
import "@/components/landing/styles/refer.css";

// Personalised per code, so never cached (public-pages.json lists /refer only, not /refer/*).
export const dynamic = "force-dynamic";

type Params = Promise<{ org: string; code: string }>;

async function load(rawCode: string) {
  const code = normalizeReferralCode(rawCode);
  const [referrer, offer] = await Promise.all([isReferralCodeShape(code) ? findReferrerByCode(code) : null, loadReferralOffer()]);
  return { code, referrer, offer };
}

// A shared link previews (WhatsApp, iMessage) as the referrer's card, like /subscribe?ref= did.
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code, referrer, offer } = await load((await params).code);
  const meta = pageMeta("Refer a friend | Tiffin Grab", "Home-style tiffins delivered across the GTA.", `/refer/${code}`);
  if (!referrer || !offer.friend) return meta;
  const title = `${friendHeadline(referrer.firstName, offer.friend)} | Tiffin Grab`;
  const description = "Build your tiffin plan. Your gift lands in your wallet after your first paid order.";
  const image = { url: referCardPath(code, { size: "og" }), width: 1200, height: 630, alt: `Tiffin Grab referral code ${code}` };
  return {
    ...meta,
    title,
    robots: { index: false },
    openGraph: { ...meta.openGraph, title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function FriendPage({ params }: { params: Params }) {
  const { org, code: raw } = await params;
  await siteOrgId(org);
  const { code, referrer, offer } = await load(raw);
  // Unknown or inactive code, or the friend side is off: the general page, never an error.
  if (!referrer || !offer.friend) return <ReferContent offer={offer} />;
  const sticker = (await loadLandingPromos().catch(() => null))?.sticker;
  const promo = sticker?.code && sticker.savings ? { code: sticker.code, savings: sticker.savings } : null;
  return <FriendWelcome code={code} firstName={referrer.firstName} friend={offer.friend} promo={promo} />;
}
