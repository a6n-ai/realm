import { BRAND_NAME } from "@/lib/brand";
import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { REFERRAL_COOKIE, isReferralCodeShape, normalizeReferralCode } from "@/lib/referrals/cookie";
import { Wizard } from "@/components/wizard/wizard";
import { currentUserId } from "@/lib/services/session-service";
import { googleClientId } from "@/lib/runtime/env";
import { getSession } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/roles";
import { googleSignInEnabled } from "@foundry/auth";
import { couponsService } from "@/lib/coupons/coupons.service";
import { SubscribeCouponsPreview } from "@/components/wizard/existing-subscriptions";
import { initialSelections, newOrderHref, quoteCodes, quoteCoins, selectionsFromQuote, type QuoteParams } from "@/lib/wizard/selections";
import { loadBuilderInputs, withFirstStart } from "@/lib/wizard/builder-inputs";
import { summaryOrNull } from "@/components/landing/landing-reviews";
import { deliveryIsFree } from "@/lib/landing/live-figures";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/landing/meta";
import { referCardPath } from "@/lib/referrals/share";
import { findReferrerByCode } from "@/lib/referrals/referrals.service";
import { loadReferralOffer } from "@/lib/referrals/offer";
import { ReferralGift } from "@/components/wizard/referral-gift";

const TITLE = `Build your tiffin plan | ${BRAND_NAME}`;
const DESCRIPTION = "Pick your diet, meal size, add-ons, delivery days and weeks, and see the total before you pay.";

// A referral link previews (WhatsApp, iMessage, Facebook) as the friend's promo card with their code.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ref?: string }> }): Promise<Metadata> {
  const meta = pageMeta(TITLE, DESCRIPTION, "/subscribe");
  const ref = normalizeReferralCode((await searchParams).ref ?? "");
  if (!isReferralCodeShape(ref)) return meta;
  const image = { url: referCardPath(ref, { size: "og" }), width: 1200, height: 630, alt: `TiffinGrab referral code ${ref}` };
  const referrer = await findReferrerByCode(ref);
  if (!referrer) return meta;
  const title = `${referrer.firstName ?? "A friend"} invited you to TiffinGrab`;
  const description = `Use code ${ref} on your first tiffin plan.`;
  return {
    ...meta,
    openGraph: { ...meta.openGraph, title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export const dynamic = "force-dynamic";

// Paint under the notch (the sticky header and bottom bar pad back with env()). The browser
// bars follow the in-app theme through <BrowserChrome> in the root layout.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ error?: string; ref?: string } & QuoteParams> }) {
  const params = await searchParams;
  const session = await getSession();
  if (session?.user && isStaffRole(session.user.role)) redirect("/dashboard");

  // Signed out: build and price the plan first; the wizard asks for the email only at "Continue to
  // checkout", then opens /checkout signed in (every order still has an owner who can pay and upload proof).
  // Signed in: the same wizard on /me/renew, with the customer's own prefill and current-plan hints.
  const userId = await currentUserId();
  // A staff estimate link carries the quoted plan; it rides along to the stepper.
  if (userId != null) redirect(newOrderHref(params));

  const [coupons, jar, inputs, reviews] = await Promise.all([couponsService.listAvailable(), cookies(), resolveRequestOrg().then(loadBuilderInputs), summaryOrNull()]);
  const { catalog, client, today, holidayDates, popular, trial } = inputs;
  const trust = { rating: reviews?.rating ?? 0, reviews: reviews?.total ?? 0, freeDelivery: deliveryIsFree(catalog) };
  const quoted = selectionsFromQuote(client, params);
  const initial = withFirstStart(client, quoted ?? initialSelections, today, null, holidayDates);
  const { error } = params;
  // ?ref= first: on a share link's first hit the proxy sets the cookie on this
  // response, so the request itself doesn't carry it yet.
  const linkRef = normalizeReferralCode(params.ref ?? "");
  const referralCode = isReferralCodeShape(linkRef) ? linkRef : (jar.get(REFERRAL_COOKIE)?.value ?? "");
  // A share link's gift, said here so it never looks lost between the friend page and payment.
  const [referrer, offer] = referralCode ? await Promise.all([findReferrerByCode(referralCode), loadReferralOffer()]) : [null, null];
  const gift = referrer && offer?.friend ? { from: referrer.firstName, figure: offer.friend.big } : null;

  return (
    <>
    <a href="#main" className="sr-only z-50 rounded-full bg-foreground px-4 py-3 text-sm font-semibold text-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
    <main id="main" tabIndex={-1} className="customer-app mx-auto w-full max-w-3xl px-4 outline-none">
      <Wizard
        catalog={client}
        closeHref="/"
        exitHref="/"
        origin="subscribe"
        initial={initial}
        quote={quoted ? { picks: initial, codes: quoteCodes(params), coins: quoteCoins(params) } : null}
        promoCodes={quoted ? [] : quoteCodes(params)}
        holidayDates={holidayDates}
        popular={popular}
        trial={trial}
        trust={trust}
        intro={gift || coupons.length ? <>{gift ? <ReferralGift from={gift.from} figure={gift.figure} /> : null}<SubscribeCouponsPreview coupons={coupons} /></> : undefined}
        signIn={{ googleClientId: googleSignInEnabled() ? googleClientId() : null, oauthError: error ?? null, referralCode }}
      />
    </main>
    </>
  );
}
