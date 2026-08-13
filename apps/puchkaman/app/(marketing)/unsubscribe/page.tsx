import type { Metadata } from "next";
import { PageBanner } from "@/components/brutal/shared";
import { buildMetadata } from "@/lib/seo";
import { applyUnsubscribe } from "@/app/api/unsubscribe/route";

export const metadata: Metadata = buildMetadata({
  title: "Unsubscribe | Puchkaman",
  description: "Stop receiving marketing email from Puchkaman.",
  path: "/unsubscribe",
});

// Reads the request URL and writes, so it can never be prerendered or cached.
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ address?: string; token?: string }>;

export default async function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const url = new URL("https://placeholder.invalid/unsubscribe");
  if (sp.address) url.searchParams.set("address", sp.address);
  if (sp.token) url.searchParams.set("token", sp.token);

  // Same handler as the API route. It is a no-op on a bad or missing token, and
  // the page below says the same thing either way — so this page cannot be used
  // to test whether an address is on the list.
  await applyUnsubscribe(url);

  return (
    <div>
      <PageBanner
        kicker="Email"
        title="You're unsubscribed"
        bg="var(--cream)"
        color="var(--ink)"
        crumb="Unsubscribe"
      />
      <section className="section-pad" style={{ background: "var(--page-bg)" }}>
        <div className="wrap" style={{ maxWidth: 640 }}>
          <div className="card" style={{ background: "var(--white)", padding: "clamp(24px,4vw,40px)" }}>
            <p style={{ fontWeight: 500, opacity: 0.88, marginBottom: 20 }}>
              You will no longer receive marketing email from Puchkaman. It can take a few minutes for
              anything already on its way to stop.
            </p>
            {/* The honest distinction, stated up front — it pre-empts the
                "I unsubscribed but still got email" complaint. */}
            <p style={{ fontWeight: 500, opacity: 0.7, marginBottom: 0 }}>
              You will still get messages about orders you place — receipts, payment confirmations and
              delivery updates. Those aren&apos;t marketing, and we send them so you know what is happening
              with your own order.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
