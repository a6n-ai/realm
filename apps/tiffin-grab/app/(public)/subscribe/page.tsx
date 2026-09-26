import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { IdentityGate } from "@/components/wizard/identity-gate";
import { SubscribeChrome } from "@/components/wizard/subscribe-chrome";
import { currentUserId } from "@/lib/services/session-service";
import { getSession } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/landing";
import { couponsService } from "@/lib/services/coupons.service";
import { SubscribeCouponsPreview } from "@/components/customer/subscribe/existing-subscriptions";

export const dynamic = "force-dynamic";

// Paint under the notch (the sticky header and bottom bar pad back with env()) and match the browser chrome to the page.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF4E7" },
    { media: "(prefers-color-scheme: dark)", color: "#14201A" },
  ],
};

export default async function SubscribePage() {
  const session = await getSession();
  if (session?.user && isStaffRole(session.user.role)) redirect("/dashboard");

  // The plan is always built signed in, on /me/renew. Signed-out visitors land
  // on the email step, which signs them in (creating the account if new) and
  // sends them there — so every order has an owner who can pay and upload proof.
  const userId = await currentUserId();
  if (userId != null) redirect("/me/renew");

  const coupons = await couponsService.listAvailable();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:py-10">
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
        <IdentityGate />
      </div>
    </main>
  );
}
