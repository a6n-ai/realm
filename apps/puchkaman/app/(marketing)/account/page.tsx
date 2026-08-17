import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageBanner } from "@/components/brutal/shared";
import { AccountAuth } from "@/components/account/account-auth";
import { landingPathFor } from "@/lib/auth/landing";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — Puchkaman",
  description: "Sign in to track your Puchkaman orders, or create an account.",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Customer-facing sign-in on the public site. Staff keep the CRM-styled /login;
 * this one lives inside the marketing shell so a customer never lands on the
 * operations console's chrome to reach their own orders.
 */
export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (session?.user) redirect(landingPathFor(session.user.role));

  const sp = await searchParams;
  const raw = sp.callbackUrl;
  const callbackUrl = typeof raw === "string" ? raw : undefined;

  return (
    <>
      <PageBanner
        kicker="Your account"
        title="Sign in"
        sub="We'll email you a one-time code — no password to remember."
        crumb="Account"
      />
      <section className="surface-cream" style={{ background: "var(--cream)" }}>
        <div className="wrap" style={{ padding: "48px 20px 64px", maxWidth: 460 }}>
          <AccountAuth callbackUrl={callbackUrl} />
        </div>
      </section>
    </>
  );
}
