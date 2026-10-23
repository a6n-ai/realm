import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { IdentityGate } from "@/components/wizard/identity-gate";
import { REFERRAL_COOKIE, isReferralCodeShape, normalizeReferralCode } from "@/lib/referrals/cookie";
import { SubscribeChrome } from "@/components/wizard/subscribe-chrome";
import { currentUserId } from "@/lib/services/session-service";
import { getSession } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/landing";
import { googleSignInEnabled } from "@foundry/auth";
import { couponsService } from "@/lib/services/coupons.service";
import { SubscribeCouponsPreview } from "@/components/customer/subscribe/existing-subscriptions";
import { newOrderHref, type QuoteParams } from "@/components/wizard/selections";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/landing/meta";

export const metadata: Metadata = pageMeta("Build your tiffin plan | Tiffin Grab", "Pick your diet, meal size, add-ons, delivery days and weeks, and see the total before you pay.", "/subscribe");

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

  // The plan is always built signed in, on /me/renew. Signed-out visitors land
  // on the email step, which signs them in (creating the account if new) and
  // sends them there — so every order has an owner who can pay and upload proof.
  const userId = await currentUserId();
  // A staff estimate link carries the quoted plan; it rides along to the stepper.
  if (userId != null) redirect(newOrderHref(params));

  const [coupons, jar] = await Promise.all([couponsService.listAvailable(), cookies()]);
  const { error } = params;
  // ?ref= first: on a share link's first hit the proxy sets the cookie on this
  // response, so the request itself doesn't carry it yet.
  const linkRef = normalizeReferralCode(params.ref ?? "");
  const referralCode = isReferralCodeShape(linkRef) ? linkRef : (jar.get(REFERRAL_COOKIE)?.value ?? "");

  return (
    <main className="customer-app mx-auto w-full max-w-3xl px-4 py-4 sm:py-10">
      <SubscribeChrome closeHref="/" stepTag="Your account" brand />
      <header className="space-y-1 pb-2">
        <h1 className="c-title-page">
          Hi! Let&apos;s build your <em className="c-accent">tiffin.</em>
        </h1>
        <p className="c-body text-pretty text-[var(--muted-foreground)]">
          Sign in with your email, then four quick steps to your weekly plan.
        </p>
      </header>

      <div className="mt-5">
        <SubscribeCouponsPreview coupons={coupons} />
      </div>
      <div className="mt-8">
        <IdentityGate googleClientId={googleSignInEnabled() ? process.env.GOOGLE_CLIENT_ID! : null} oauthError={error ?? null} defaultReferralCode={referralCode} />
      </div>
    </main>
  );
}
