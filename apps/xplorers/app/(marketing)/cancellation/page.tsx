import { SITE_NAME } from "@/lib/brand";
import { InteriorPage } from "@/components/marketing/interior-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Cancellation · ${SITE_NAME}`,
  description: "How to move or cancel a booked session.",
  path: "/cancellation",
  noIndex: true,
});

export default function CancellationPage() {
  return (
    <InteriorPage
      kicker="Cancellation policy"
      title="Move the date if you need."
      body="Write to us before the session. We will move you or hold the fee as studio credit. Same-day no-shows are charged."
      cta="Email us"
      href="mailto:hello@xplorers.life"
    />
  );
}
